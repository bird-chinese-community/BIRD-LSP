import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CROSS_FILE_MAX_DEPTH,
  DEFAULT_CROSS_FILE_MAX_FILES,
  resolveCrossFileReferences,
  type SymbolTable,
} from "@birdcc/core";
import {
  createConnection,
  type Diagnostic,
  type InlayHint,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
import {
  lintBirdConfig,
  lintResolvedCrossFileGraph,
  type LintResult,
} from "@birdcc/linter";
import { formatBirdConfig } from "@birdcc/formatter";
import { createAsnIntel, type AsnIntel } from "@birdcc/intel";
import { createCompletionItemsFromParsed } from "./completion.js";
import { createDefinitionLocations } from "./definition.js";
import { createDocumentSymbolsFromParsed } from "./document-symbol.js";
import { toInternalErrorDiagnostic, toLspDiagnostic } from "./diagnostic.js";
import { createHoverFromParsed } from "./hover.js";
import { createAsnCompletionItems } from "./asn-completion.js";
import { createAsnInlayHints } from "./asn-inlay-hints.js";
import { createTypeHintInlayHints } from "./type-hint-inlay.js";
import { createAsnHover } from "./asn-hover.js";
import { detectWorkspaceEntry } from "./init/workspace-init.js";
import { resolveProjectAnalysisOptions } from "./project-config.js";
import { createReferenceLocations } from "./references.js";
import {
  clearDiagnostics,
  clearDiagnosticsMany,
  getLineText,
  publishDiagnostics,
  showInfoOnce,
  withDocument,
} from "./utils.js";
import { createValidationScheduler } from "./validation.js";

const VALIDATION_DEBOUNCE_MS = 120;
const INCLUDE_MAX_DEPTH = DEFAULT_CROSS_FILE_MAX_DEPTH;
const INCLUDE_MAX_FILES = DEFAULT_CROSS_FILE_MAX_FILES;
const PROJECT_CONFIG_FILE_NAMES = ["bird.config.json", "birdcc.config.json"];

interface ParsedCacheEntry {
  version: number;
  parsed: ParsedBirdDocument;
}

interface GraphCacheEntry {
  entryUri: string;
  visitedUris: Set<string>;
  symbolTable: SymbolTable;
  byUri: Record<string, LintResult>;
}

const warmupParserRuntime = async (): Promise<void> => {
  try {
    await lintBirdConfig("");
  } catch {
    // Warmup is best-effort and must not block server startup.
  }
};

const flattenAdditionalDeclarations = (
  graph: GraphCacheEntry,
  uri: string,
): ParsedBirdDocument["program"]["declarations"] => {
  const declarations: ParsedBirdDocument["program"]["declarations"] = [];

  for (const [itemUri, lintResult] of Object.entries(graph.byUri)) {
    if (itemUri === uri) {
      continue;
    }

    declarations.push(...lintResult.parsed.program.declarations);
  }

  return declarations;
};

export interface LspServerOptions {
  /** Override the path to the ASN database binary. Undefined = use bundled default. */
  asnDbPath?: string;
  /** Disable ASN intelligence entirely. */
  disableAsnIntel?: boolean;
}

/** Starts the stdio LSP server with async lint validation and last-write-wins scheduling. */
export const startLspServer = (options?: LspServerOptions): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const parsedByUri = new Map<string, ParsedCacheEntry>();
  const graphByUri = new Map<string, GraphCacheEntry>();
  const publishedUrisByEntry = new Map<string, Set<string>>();
  /** Dedup in-flight `getGraphForDocument` calls so concurrent requests share one analysis. */
  const pendingGraphByUri = new Map<string, Promise<GraphCacheEntry>>();
  const announcedProjectConfigs = new Set<string>();
  const announcedInfoNotifications = new Set<string>();
  let workspaceRootUris: string[] = [];
  let noConfigTipAnnounced = false;
  let hasShutdownBeenRequested = false;

  // ASN intelligence — loads the bundled database (gracefully degrades if missing)
  const asnIntel: AsnIntel = options?.disableAsnIntel
    ? {
        available: false,
        count: 0,
        exactLookup: () => undefined,
        prefixSearch: () => [],
        formatDisplay: () => ({
          inlayLabel: "",
          completionDetail: "",
          hoverMarkdown: "",
        }),
        lookupDisplay: () => undefined,
      }
    : createAsnIntel(options?.asnDbPath);

  if (asnIntel.available) {
    connection.console.log(
      `[intel] ASN database loaded: ${asnIntel.count} records`,
    );
  }

  void warmupParserRuntime();

  const hasProjectConfigAtWorkspaceRoot = async (
    workspaceRootUri: string,
  ): Promise<boolean> => {
    try {
      const workspaceRootPath = fileURLToPath(workspaceRootUri);
      for (const fileName of PROJECT_CONFIG_FILE_NAMES) {
        // eslint-disable-next-line no-await-in-loop
        try {
          await access(join(workspaceRootPath, fileName));
          return true;
        } catch (error) {
          const ioError = error as NodeJS.ErrnoException;
          if (ioError.code === "ENOENT") {
            continue;
          }
          throw error;
        }
      }

      return false;
    } catch {
      return false;
    }
  };

  const notifyInfoOnce = (key: string, message: string): void => {
    showInfoOnce(connection, announcedInfoNotifications, key, message);
  };

  const clearEntryTracking = (entryUri: string): void => {
    const previousUris = publishedUrisByEntry.get(entryUri);
    if (previousUris) {
      clearDiagnosticsMany(connection, previousUris);
      publishedUrisByEntry.delete(entryUri);
    }

    for (const [uri, graph] of graphByUri.entries()) {
      if (graph.entryUri === entryUri) {
        graphByUri.delete(uri);
      }
    }
  };

  const analyzeDocument = async (
    document: TextDocument,
    options: { publishRelatedDiagnostics: boolean },
  ): Promise<{ entryDiagnostics: Diagnostic[]; graph: GraphCacheEntry }> => {
    const project = await resolveProjectAnalysisOptions({
      documentUri: document.uri,
      workspaceRootUris,
      defaults: {
        maxDepth: INCLUDE_MAX_DEPTH,
        maxFiles: INCLUDE_MAX_FILES,
      },
    });

    if (
      project.configPath &&
      !announcedProjectConfigs.has(project.configPath)
    ) {
      announcedProjectConfigs.add(project.configPath);
      connection.console.log(
        `[project] using ${project.configPath} (mode=${project.mode}, entry=${project.entryUri})`,
      );
      notifyInfoOnce(
        `project-config:${project.configPath}`,
        `Using ${basename(project.configPath)} (${project.mode} mode) for cross-file analysis.`,
      );
    } else if (
      !project.configPath &&
      workspaceRootUris.length > 1 &&
      !noConfigTipAnnounced
    ) {
      noConfigTipAnnounced = true;
      connection.console.log(
        "[project] no bird.config.json detected; add one with workspaces/main/includePaths for monorepo-grade analysis",
      );
      notifyInfoOnce(
        "project-config:missing-monorepo",
        "No bird.config.json found in this multi-root workspace. Add workspaces/main/includePaths for better analysis.",
      );
    }

    if (!project.crossFileEnabled) {
      const lintResult = await lintBirdConfig(document.getText(), {
        uri: document.uri,
      });
      const graph: GraphCacheEntry = {
        entryUri: document.uri,
        visitedUris: new Set([document.uri]),
        symbolTable: lintResult.core.symbolTable,
        byUri: { [document.uri]: lintResult },
      };

      parsedByUri.set(document.uri, {
        version: document.version,
        parsed: lintResult.parsed,
      });
      graphByUri.set(document.uri, graph);

      return {
        entryDiagnostics: lintResult.diagnostics.map(toLspDiagnostic),
        graph,
      };
    }

    const openDocuments = documents.all().map((item) => ({
      uri: item.uri,
      text: item.getText(),
    }));

    const crossFile = await resolveCrossFileReferences({
      entryUri: project.entryUri,
      documents: openDocuments,
      loadFromFileSystem: true,
      maxDepth: project.maxDepth,
      maxFiles: project.maxFiles,
      workspaceRootUri: project.workspaceRootUri,
      allowIncludeOutsideWorkspace: project.allowIncludeOutsideWorkspace,
      includeSearchPaths: project.includeSearchPathUris,
    });

    const lintGraph = await lintResolvedCrossFileGraph(crossFile);
    if (!Object.hasOwn(lintGraph.byUri, document.uri)) {
      lintGraph.byUri[document.uri] = await lintBirdConfig(document.getText(), {
        uri: document.uri,
      });
    }
    const visitedUris = new Set(
      crossFile.visitedUris.length > 0
        ? crossFile.visitedUris
        : [project.entryUri],
    );
    visitedUris.add(document.uri);

    const graph: GraphCacheEntry = {
      entryUri: document.uri,
      visitedUris,
      symbolTable: crossFile.symbolTable,
      byUri: lintGraph.byUri,
    };

    for (const [uri, lintResult] of Object.entries(lintGraph.byUri)) {
      const liveDocument = documents.get(uri);
      parsedByUri.set(uri, {
        version: liveDocument?.version ?? -1,
        parsed: lintResult.parsed,
      });
      graphByUri.set(uri, graph);
    }

    const diagnosticsByUri = new Map<string, Diagnostic[]>();
    for (const uri of visitedUris) {
      const lintResult = lintGraph.byUri[uri];
      diagnosticsByUri.set(
        uri,
        (lintResult?.diagnostics ?? []).map(toLspDiagnostic),
      );
    }

    const entryDiagnostics = diagnosticsByUri.get(document.uri) ?? [];
    if (options.publishRelatedDiagnostics) {
      const previousUris =
        publishedUrisByEntry.get(document.uri) ?? new Set<string>();

      for (const uri of previousUris) {
        if (!visitedUris.has(uri)) {
          clearDiagnostics(connection, uri);
        }
      }

      for (const [uri, diagnostics] of diagnosticsByUri) {
        if (uri !== document.uri) {
          publishDiagnostics(
            connection,
            uri,
            diagnostics,
            documents.get(uri)?.version,
          );
        }
      }

      publishedUrisByEntry.set(document.uri, visitedUris);
    }

    return { entryDiagnostics, graph };
  };

  const getGraphForDocument = async (
    document: TextDocument,
  ): Promise<GraphCacheEntry> => {
    const cached = graphByUri.get(document.uri);
    if (cached) {
      return cached;
    }

    // Dedup concurrent requests: reuse in-flight promise for the same URI.
    const pending = pendingGraphByUri.get(document.uri);
    if (pending) {
      return pending;
    }

    const promise = analyzeDocument(document, {
      publishRelatedDiagnostics: false,
    }).then((analyzed) => analyzed.graph);

    pendingGraphByUri.set(document.uri, promise);
    try {
      return await promise;
    } finally {
      pendingGraphByUri.delete(document.uri);
    }
  };

  connection.onInitialize((params): InitializeResult => {
    workspaceRootUris =
      params.workspaceFolders
        ?.map((folder) => folder.uri)
        .filter((uri) => uri.startsWith("file://")) ?? [];
    if (
      workspaceRootUris.length === 0 &&
      params.rootUri &&
      params.rootUri.startsWith("file://")
    ) {
      workspaceRootUris = [params.rootUri];
    }

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentSymbolProvider: true,
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentFormattingProvider: true,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: [" ", "."],
        },
        inlayHintProvider: true,
      },
    };
  });

  connection.onInitialized(() => {
    void (async () => {
      for (const workspaceRootUri of workspaceRootUris) {
        if (hasShutdownBeenRequested) {
          return;
        }

        // eslint-disable-next-line no-await-in-loop
        const hasProjectConfig =
          await hasProjectConfigAtWorkspaceRoot(workspaceRootUri);
        if (hasProjectConfig) {
          continue;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          await detectWorkspaceEntry(workspaceRootUri, connection);
        } catch (error) {
          connection.console.log(
            `[init] workspace entry detection failed for ${workspaceRootUri}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    })();
  });

  const scheduler = createValidationScheduler<TextDocument, Diagnostic>({
    debounceMs: VALIDATION_DEBOUNCE_MS,
    validate: async (textDocument): Promise<Diagnostic[]> => {
      try {
        const analyzed = await analyzeDocument(textDocument, {
          publishRelatedDiagnostics: true,
        });
        return analyzed.entryDiagnostics;
      } catch (error) {
        return [toInternalErrorDiagnostic(error)];
      }
    },
    publish: ({ uri, version, diagnostics }) => {
      publishDiagnostics(connection, uri, diagnostics, version);
    },
  });

  documents.onDidOpen((event) => {
    scheduler.schedule(event.document);
  });

  documents.onDidChangeContent((event) => {
    scheduler.schedule(event.document);
  });

  documents.onDidClose((event) => {
    parsedByUri.delete(event.document.uri);
    clearEntryTracking(event.document.uri);
    scheduler.close(event.document.uri);
  });

  const getParsedDocument = async (
    document: TextDocument,
  ): Promise<ParsedBirdDocument> => {
    const cached = parsedByUri.get(document.uri);
    if (cached && cached.version === document.version) {
      return cached.parsed;
    }

    const parsed = await parseBirdConfig(document.getText());
    parsedByUri.set(document.uri, {
      version: document.version,
      parsed,
    });
    return parsed;
  };

  connection.onDocumentSymbol(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      const parsed = await getParsedDocument(document);
      return createDocumentSymbolsFromParsed(parsed);
    }),
  );

  connection.onHover(async (params) =>
    withDocument(documents, params.textDocument.uri, null, async (document) => {
      // Try ASN hover first (more specific)
      if (asnIntel.available) {
        const lineText = getLineText(document, params.position.line);
        const asnHover = createAsnHover(asnIntel, lineText, params.position);
        if (asnHover) return asnHover;
      }

      const parsed = await getParsedDocument(document);
      return createHoverFromParsed(parsed, document, params.position);
    }),
  );

  connection.onDefinition(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      try {
        const graph = await getGraphForDocument(document);
        return createDefinitionLocations(
          graph.symbolTable,
          document.uri,
          params.position,
          document.getText(),
        );
      } catch {
        return [];
      }
    }),
  );

  connection.onReferences(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      try {
        const graph = await getGraphForDocument(document);
        return createReferenceLocations(
          graph.symbolTable,
          document.uri,
          params.position,
          document.getText(),
        );
      } catch {
        return [];
      }
    }),
  );

  connection.onCompletion(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      const parsed = await getParsedDocument(document);
      const linePrefix = document.getText({
        start: { line: params.position.line, character: 0 },
        end: params.position,
      });

      // Check if we're in an ASN context — return ASN completions instead
      if (asnIntel.available) {
        const asnItems = createAsnCompletionItems(asnIntel, linePrefix);
        if (asnItems.length > 0) return asnItems;
      }

      try {
        const graph = await getGraphForDocument(document);
        return createCompletionItemsFromParsed(parsed, {
          linePrefix,
          additionalDeclarations: flattenAdditionalDeclarations(
            graph,
            document.uri,
          ),
        });
      } catch {
        return createCompletionItemsFromParsed(parsed, { linePrefix });
      }
    }),
  );

  connection.onDocumentFormatting(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      try {
        const text = document.getText();
        const result = await formatBirdConfig(text);
        if (!result.changed) {
          return [];
        }

        const lines = text.split("\n");
        const lastLine = lines.length - 1;
        const lastChar = lines[lastLine]?.length ?? 0;

        return [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: lastLine, character: lastChar },
            },
            newText: result.text,
          },
        ];
      } catch (error) {
        connection.console.log(
          `[format] formatting failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return [];
      }
    }),
  );

  // Inlay Hints (ASN + function return type)
  connection.languages.inlayHint.on(async (params) =>
    withDocument(
      documents,
      params.textDocument.uri,
      [],
      async (document): Promise<InlayHint[]> => {
        const text = document.getText();
        const results: InlayHint[] = [];

        // ASN inlay hints
        if (asnIntel.available) {
          results.push(...createAsnInlayHints(asnIntel, text, params.range));
        }

        // Function return type inlay hints
        try {
          const typeHints = await createTypeHintInlayHints(text, params.range);
          results.push(...typeHints);
        } catch {
          // Type hint inference is best-effort
        }

        return results;
      },
    ),
  );

  connection.onShutdown(() => {
    hasShutdownBeenRequested = true;
  });

  connection.onExit(() => {
    if (!hasShutdownBeenRequested) {
      process.exitCode = 1;
    }
  });

  documents.listen(connection);
  connection.listen();
};
