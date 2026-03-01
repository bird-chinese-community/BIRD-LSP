import { resolveCrossFileReferences, type SymbolTable } from "@birdcc/core";
import {
  createConnection,
  type Diagnostic,
  type InitializeResult,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
import { lintBirdConfig, lintResolvedCrossFileGraph, type LintResult } from "@birdcc/linter";
import { createCompletionItemsFromParsed } from "./completion.js";
import { createDefinitionLocations } from "./definition.js";
import { createDocumentSymbolsFromParsed } from "./document-symbol.js";
import { toInternalErrorDiagnostic, toLspDiagnostic } from "./diagnostic.js";
import { createHoverFromParsed } from "./hover.js";
import { createReferenceLocations } from "./references.js";
import { createValidationScheduler } from "./validation.js";

const VALIDATION_DEBOUNCE_MS = 120;
const INCLUDE_MAX_DEPTH = 16;
const INCLUDE_MAX_FILES = 256;

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

/** Starts the stdio LSP server with async lint validation and last-write-wins scheduling. */
export const startLspServer = (): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const parsedByUri = new Map<string, ParsedCacheEntry>();
  const graphByUri = new Map<string, GraphCacheEntry>();
  const publishedUrisByEntry = new Map<string, Set<string>>();
  let hasShutdownBeenRequested = false;

  void warmupParserRuntime();

  const clearEntryTracking = (entryUri: string): void => {
    const publishedUris = publishedUrisByEntry.get(entryUri);
    if (publishedUris) {
      for (const uri of publishedUris) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
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
    const openDocuments = documents.all().map((item) => ({
      uri: item.uri,
      text: item.getText(),
    }));

    const crossFile = await resolveCrossFileReferences({
      entryUri: document.uri,
      documents: openDocuments,
      loadFromFileSystem: true,
      maxDepth: INCLUDE_MAX_DEPTH,
      maxFiles: INCLUDE_MAX_FILES,
    });

    const lintGraph = await lintResolvedCrossFileGraph(crossFile);
    const visitedUris = new Set(
      crossFile.visitedUris.length > 0 ? crossFile.visitedUris : [document.uri],
    );

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
      diagnosticsByUri.set(uri, (lintResult?.diagnostics ?? []).map(toLspDiagnostic));
    }

    const entryDiagnostics = diagnosticsByUri.get(document.uri) ?? [];
    if (options.publishRelatedDiagnostics) {
      const previousUris = publishedUrisByEntry.get(document.uri) ?? new Set<string>();

      for (const uri of previousUris) {
        if (visitedUris.has(uri)) {
          continue;
        }

        connection.sendDiagnostics({ uri, diagnostics: [] });
      }

      for (const [uri, diagnostics] of diagnosticsByUri) {
        if (uri === document.uri) {
          continue;
        }

        connection.sendDiagnostics({
          uri,
          version: documents.get(uri)?.version,
          diagnostics,
        });
      }

      publishedUrisByEntry.set(document.uri, visitedUris);
    }

    return { entryDiagnostics, graph };
  };

  const getGraphForDocument = async (document: TextDocument): Promise<GraphCacheEntry> => {
    const cached = graphByUri.get(document.uri);
    if (cached) {
      return cached;
    }

    const analyzed = await analyzeDocument(document, { publishRelatedDiagnostics: false });
    return analyzed.graph;
  };

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentSymbolProvider: true,
        hoverProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: [" ", "."],
        },
      },
    }),
  );

  const scheduler = createValidationScheduler<TextDocument, Diagnostic>({
    debounceMs: VALIDATION_DEBOUNCE_MS,
    validate: async (textDocument): Promise<Diagnostic[]> => {
      try {
        const analyzed = await analyzeDocument(textDocument, { publishRelatedDiagnostics: true });
        return analyzed.entryDiagnostics;
      } catch (error) {
        return [toInternalErrorDiagnostic(error)];
      }
    },
    publish: (payload) => {
      connection.sendDiagnostics(payload);
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

  const getParsedDocument = async (document: TextDocument): Promise<ParsedBirdDocument> => {
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

  connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await getParsedDocument(document);
    return createDocumentSymbolsFromParsed(parsed);
  });

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    const parsed = await getParsedDocument(document);
    return createHoverFromParsed(parsed, document, params.position);
  });

  connection.onDefinition(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

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
  });

  connection.onReferences(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

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
  });

  connection.onCompletion(async (params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return [];
    }

    const parsed = await getParsedDocument(document);
    const linePrefix = document.getText({
      start: { line: params.position.line, character: 0 },
      end: params.position,
    });

    try {
      const graph = await getGraphForDocument(document);
      return createCompletionItemsFromParsed(parsed, {
        linePrefix,
        additionalDeclarations: flattenAdditionalDeclarations(graph, document.uri),
      });
    } catch {
      return createCompletionItemsFromParsed(parsed, { linePrefix });
    }
  });

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
