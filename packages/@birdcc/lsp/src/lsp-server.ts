import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_CROSS_FILE_MAX_DEPTH,
  DEFAULT_CROSS_FILE_MAX_FILES,
  collectFunctionReturnHints,
  applyLintConfiguration,
  birdEditorSettingsSchema,
  resolveAnalysisBudget,
  type BirdEditorSettings,
  resolveCrossFileReferences,
  type FunctionReturnHint,
  type SymbolTable,
} from "@birdcc/core";
import {
  createConnection,
  DidChangeWatchedFilesNotification,
  type Diagnostic,
  type InlayHint,
  type InitializeResult,
  ProposedFeatures,
  LSPErrorCodes,
  ResponseError,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
import {
  lintBirdConfig,
  lintResolvedCrossFileGraph,
  type LintResult,
} from "@birdcc/linter";
import { formatBirdConfig } from "@birdcc/formatter";
import { createAsnIntel, createDn42Intel, type AsnIntel } from "@birdcc/intel";
import { createCompletionItemsFromParsed } from "./completion.js";
import { createDefinitionLocations } from "./definition.js";
import { createDocumentSymbolsFromParsed } from "./document-symbol.js";
import { toInternalErrorDiagnostic, toLspDiagnostic } from "./diagnostic.js";
import { createHoverFromParsed } from "./hover.js";
import { createAsnCompletionItems } from "./asn-completion.js";
import { createAsnInlayHints } from "./asn-inlay-hints.js";
import { createTypeHintInlayHints } from "./type-hint-inlay.js";
import { createAsnHover } from "./asn-hover.js";
import {
  formatDn42AsnHover,
  formatDn42IpHover,
  type Dn42HoverMarkup,
} from "./dn42-hover.js";
import { findDn42Hover } from "./dn42-target.js";
import { detectWorkspaceEntry } from "./init/workspace-init.js";
import {
  createProjectAnalysisResolver,
  type ProjectAnalysisOptions,
} from "./project-config.js";
import { createReferenceLocations } from "./references.js";
import { evaluateLspDocumentEligibility } from "./document-eligibility.js";
import {
  clearDiagnostics,
  clearDiagnosticsMany,
  getLineText,
  publishDiagnostics,
  showInfoOnce,
  withDocument,
  toLspRange,
} from "./utils.js";
import { createValidationScheduler } from "./validation.js";
import { isPathWithinRoot } from "./paths.js";
import {
  createProjectConfigWatchers,
  PROJECT_CONFIG_FILE_NAMES,
} from "./config-watchers.js";

const VALIDATION_DEBOUNCE_MS = 120;
const INCLUDE_MAX_DEPTH = DEFAULT_CROSS_FILE_MAX_DEPTH;
const INCLUDE_MAX_FILES = DEFAULT_CROSS_FILE_MAX_FILES;
const IGNORED_WATCH_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "coverage",
  "vendor",
  ".pnpm",
]);
const isWithinUri = (uri: string, rootUri: string | undefined): boolean => {
  if (!rootUri || !uri.startsWith("file://") || !rootUri.startsWith("file://"))
    return false;
  return isPathWithinRoot(fileURLToPath(uri), fileURLToPath(rootUri));
};

interface ParsedCacheEntry {
  version: number;
  parsed: ParsedBirdDocument;
}

interface GraphCacheEntry {
  entryUri: string;
  visitedUris: Set<string>;
  symbolTable: SymbolTable;
  byUri: Record<string, LintResult>;
  dependencyDirectoryUris?: Set<string>;
  workspaceRootUri?: string;
}

interface TypeHintCacheEntry {
  version: number;
  hints: readonly FunctionReturnHint[];
}

interface EligibilityCacheEntry {
  version: number;
  projectConfigGeneration: number;
  eligible: boolean;
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
  dn42CacheDir?: string;
  dn42BaseUrl?: string;
}

/** Starts the stdio LSP server with async lint validation and last-write-wins scheduling. */
export const startLspServer = (options?: LspServerOptions): void => {
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);
  const projectResolver = createProjectAnalysisResolver();
  const parsedByUri = new Map<string, ParsedCacheEntry>();
  const graphByUri = new Map<string, GraphCacheEntry>();
  const typeHintsByUri = new Map<string, TypeHintCacheEntry>();
  const eligibilityByUri = new Map<string, EligibilityCacheEntry>();
  const pendingEligibilityByKey = new Map<
    string,
    { document: TextDocument; promise: Promise<boolean> }
  >();
  const publishedUrisByEntry = new Map<string, Set<string>>();
  /** Dedup in-flight `getGraphForDocument` calls so concurrent requests share one analysis. */
  const pendingGraphByUri = new Map<string, Promise<GraphCacheEntry>>();
  const announcedProjectConfigs = new Set<string>();
  const announcedInfoNotifications = new Set<string>();
  let workspaceRootUris: string[] = [];
  let supportsDynamicFileWatching = false;
  let supportsRelativeFileWatching = false;
  let supportsConfiguration = false;
  let supportsInlayHintRefresh = false;
  let editorSettings: BirdEditorSettings = {};
  const settingsByUri = new Map<string, Promise<BirdEditorSettings>>();
  const configurationDiagnosticUris = new Set<string>();
  let projectConfigGeneration = 0;
  const generationByUri = new Map<string, number>();
  const activeAnalyses = new Set<{ uri: string; rootUri?: string }>();
  const watchedDependencyDirectories = new Set<string>();
  const configurationWatchRegistrations = new Map<string, Promise<void>>();
  const configWatchers = createProjectConfigWatchers(
    (uri) => {
      projectResolver.invalidate(uri);
      invalidateAnalysis(uri, true);
    },
    (directory, error) => {
      const code =
        "code" in error && typeof error.code === "string"
          ? ` [${error.code}]`
          : "";
      connection.console.error(
        `Unable to watch project configuration in ${directory}${code}: ${error.message}`,
      );
    },
  );
  let nextGeneration = 0;
  const watchGlob = (
    baseUri: string,
    pattern: string,
  ): string | { baseUri: string; pattern: string } => {
    if (supportsRelativeFileWatching) return { baseUri, pattern };
    const path = fileURLToPath(baseUri)
      .replaceAll("\\", "/")
      .replace(/\/+$/, "")
      .replace(/[?*[\]{}]/g, (character) => `[${character}]`);
    return `${path}/${pattern}`;
  };
  let noConfigTipAnnounced = false;
  let hasShutdownBeenRequested = false;
  let dn42Enabled = false;
  let dn42Markup: Dn42HoverMarkup = "markdown";
  let dn42ConfigurationGeneration = 0;
  // Node's fetch ignores proxy variables; DN42 downloads are its only caller.
  if (
    ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].some(
      (name) => process.env[name],
    )
  )
    setGlobalDispatcher(new EnvHttpProxyAgent());
  const cacheHome = process.env.XDG_CACHE_HOME;
  const dn42Intel = createDn42Intel({
    cacheDir:
      options?.dn42CacheDir ??
      join(
        cacheHome && isAbsolute(cacheHome)
          ? cacheHome
          : process.platform === "win32" && process.env.LOCALAPPDATA
            ? process.env.LOCALAPPDATA
            : join(homedir(), ".cache"),
        "birdcc",
        "dn42-ipdb",
      ),
    baseUrl: options?.dn42BaseUrl,
    onError: (error) =>
      connection.console.error(`[intel] DN42 IPDB: ${error.message}`),
  });
  const setDn42Enabled = (enabled: boolean): void => {
    dn42Enabled = enabled;
    dn42Intel.setEnabled(enabled);
  };
  const updateDn42Settings = (): void => {
    const generation = ++dn42ConfigurationGeneration;
    const fallback = editorSettings.intel;
    if (!supportsConfiguration) {
      setDn42Enabled(
        fallback?.dn42?.enabled === true &&
          fallback.enabled !== false &&
          fallback.hover !== false,
      );
      return;
    }
    // Unscoped items: the client answers with user-level values.
    void connection.workspace
      .getConfiguration([
        { section: "bird2-lsp.intel.dn42.enabled" },
        { section: "bird2-lsp.intel.enabled" },
        { section: "bird2-lsp.intel.hover" },
      ])
      .then(([enabled, intelEnabled, hoverEnabled]) => {
        if (
          generation === dn42ConfigurationGeneration &&
          !hasShutdownBeenRequested
        ) {
          setDn42Enabled(
            (enabled ?? fallback?.dn42?.enabled) === true &&
              (intelEnabled ?? fallback?.enabled) !== false &&
              (hoverEnabled ?? fallback?.hover) !== false,
          );
        }
      })
      .catch((error) => {
        if (generation === dn42ConfigurationGeneration) setDn42Enabled(false);
        connection.console.error(`[intel] DN42 settings: ${String(error)}`);
      });
  };

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
  } else if (asnIntel.failure) {
    connection.console.warn(
      `[intel] ASN database unavailable: ${JSON.stringify(asnIntel.failure)}`,
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
    void configWatchers.clearDependencies(entryUri);
    const previousUris = publishedUrisByEntry.get(entryUri);
    publishedUrisByEntry.delete(entryUri);
    if (previousUris) {
      const retainedUris = new Set<string>();
      for (const uris of publishedUrisByEntry.values())
        for (const uri of uris) retainedUris.add(uri);
      clearDiagnosticsMany(
        connection,
        [...previousUris].filter((uri) => !retainedUris.has(uri)),
      );
    }

    for (const [uri, graph] of graphByUri.entries()) {
      if (graph.entryUri === entryUri) {
        graphByUri.delete(uri);
      }
    }
  };

  const registerRootlessConfigWatchers = async (uri: string): Promise<void> => {
    if (workspaceRootUris.length > 0 || !uri.startsWith("file://")) return;

    configWatchers.watch(uri);
    if (!supportsDynamicFileWatching) return;

    const directories: string[] = [];
    let directory = dirname(fileURLToPath(uri));
    while (true) {
      directories.push(pathToFileURL(directory).toString());
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    const missing = directories.filter(
      (baseUri) => !configurationWatchRegistrations.has(baseUri),
    );
    if (missing.length > 0) {
      const registration = connection.client
        .register(DidChangeWatchedFilesNotification.type, {
          watchers: missing.flatMap((baseUri) =>
            PROJECT_CONFIG_FILE_NAMES.map((name) => ({
              globPattern: watchGlob(baseUri, name),
            })),
          ),
        })
        .then(() => undefined)
        .catch((error) => {
          for (const baseUri of missing)
            configurationWatchRegistrations.delete(baseUri);
          connection.console.error(
            `Unable to watch project configuration for ${uri}: ${String(error)}`,
          );
        });
      for (const baseUri of missing)
        configurationWatchRegistrations.set(baseUri, registration);
    }
    await Promise.all(
      directories.map((baseUri) =>
        configurationWatchRegistrations.get(baseUri),
      ),
    );
  };

  const resolveProjectForDocument = async (
    document: TextDocument,
  ): Promise<ProjectAnalysisOptions> => {
    const identity = documents.get(document.uri);
    const version = document.version;
    const generation = generationByUri.get(document.uri);
    if (
      !identity ||
      identity.version !== version ||
      identity.getText() !== document.getText()
    )
      throw new ResponseError(
        LSPErrorCodes.ContentModified,
        `Project input changed: ${document.uri}`,
      );
    await registerRootlessConfigWatchers(document.uri);
    const project = await projectResolver.resolve({
      documentUri: document.uri,
      workspaceRootUris,
      defaults: {
        maxDepth: INCLUDE_MAX_DEPTH,
        maxFiles: INCLUDE_MAX_FILES,
      },
    });
    if (
      documents.get(document.uri) !== identity ||
      identity?.version !== version ||
      generationByUri.get(document.uri) !== generation
    )
      throw new ResponseError(
        LSPErrorCodes.ContentModified,
        `Project input changed: ${document.uri}`,
      );
    if (project.configPath) {
      const uri = pathToFileURL(project.configPath).toString();
      if (configurationDiagnosticUris.delete(uri))
        clearDiagnostics(connection, uri);
    }
    const settings = await getEditorSettings(document.uri);
    return {
      ...project,
      ...resolveAnalysisBudget(
        project.config?.crossFile,
        settings.performance?.maxFileSizeBytes,
      ),
    };
  };

  const getEditorSettings = (uri: string): Promise<BirdEditorSettings> => {
    if (!supportsConfiguration) return Promise.resolve(editorSettings);
    const cached = settingsByUri.get(uri);
    if (cached) return cached;
    const task = connection.workspace
      .getConfiguration({ scopeUri: uri, section: "bird2-lsp" })
      .then((settings) => {
        const resource = birdEditorSettingsSchema.parse(settings ?? {});
        return {
          ...editorSettings,
          ...resource,
          intel: { ...editorSettings.intel, ...resource.intel },
          formatter: { ...editorSettings.formatter, ...resource.formatter },
          performance: {
            ...editorSettings.performance,
            ...resource.performance,
          },
          typeHints: {
            ...editorSettings.typeHints,
            ...resource.typeHints,
            inlay: {
              ...editorSettings.typeHints?.inlay,
              ...resource.typeHints?.inlay,
            },
          },
        };
      });
    settingsByUri.set(uri, task);
    return task;
  };

  const isDocumentEligible = async (
    document: TextDocument,
    project?: ProjectAnalysisOptions,
  ): Promise<boolean> => {
    const version = document.version;
    const text = document.getText();
    const inputGeneration = generationByUri.get(document.uri);
    const liveDocument = documents.get(document.uri);
    if (
      !liveDocument ||
      liveDocument.version !== version ||
      liveDocument.getText() !== text
    )
      throw new ResponseError(
        LSPErrorCodes.ContentModified,
        `Eligibility input changed: ${document.uri}`,
      );
    const enabledSettings = await getEditorSettings(document.uri);
    if (
      generationByUri.get(document.uri) !== inputGeneration ||
      documents.get(document.uri) !== liveDocument ||
      liveDocument.version !== version
    )
      throw new ResponseError(
        LSPErrorCodes.ContentModified,
        `Eligibility input changed: ${document.uri}`,
      );
    if (enabledSettings.enabled === false) return false;
    const cached = eligibilityByUri.get(document.uri);
    if (
      cached?.version === document.version &&
      cached.projectConfigGeneration === projectConfigGeneration
    ) {
      return cached.eligible;
    }

    const evaluationGeneration = projectConfigGeneration;
    const pendingKey = `${document.uri}@${version}@${inputGeneration}@${evaluationGeneration}`;
    const pending = pendingEligibilityByKey.get(pendingKey);
    if (pending?.document === liveDocument) {
      return pending.promise;
    }

    const task = (async (): Promise<boolean> => {
      const resolvedProject =
        project ?? (await resolveProjectForDocument(document));
      if (
        Buffer.byteLength(document.getText(), "utf8") >
        Math.min(
          resolvedProject.maxDocumentBytes,
          resolvedProject.maxTotalBytes,
        )
      )
        return false;
      const eligibility = await evaluateLspDocumentEligibility(
        text,
        document.uri,
        resolvedProject,
      );
      if (
        documents.get(document.uri) !== liveDocument ||
        liveDocument.version !== version ||
        generationByUri.get(document.uri) !== inputGeneration
      )
        throw new ResponseError(
          LSPErrorCodes.ContentModified,
          `Eligibility input changed: ${document.uri}`,
        );
      if (
        evaluationGeneration === projectConfigGeneration &&
        documents.get(document.uri) === liveDocument &&
        liveDocument.version === version &&
        generationByUri.get(document.uri) === inputGeneration
      ) {
        // Guard against out-of-order completions: only overwrite the cache when
        // this task evaluated a newer (or the same) document version. Skip the
        // write entirely if the document was closed while this task was pending,
        // so a resolved promise can't resurrect a deleted cache entry.
        const currentCached = eligibilityByUri.get(document.uri);
        if (
          !currentCached ||
          currentCached.projectConfigGeneration !== evaluationGeneration ||
          currentCached.version < version
        ) {
          eligibilityByUri.set(document.uri, {
            version,
            projectConfigGeneration: evaluationGeneration,
            eligible: eligibility.eligible,
          });
        }
      }
      return eligibility.eligible;
    })();

    pendingEligibilityByKey.set(pendingKey, {
      document: liveDocument,
      promise: task,
    });
    try {
      return await task;
    } finally {
      if (pendingEligibilityByKey.get(pendingKey)?.promise === task) {
        pendingEligibilityByKey.delete(pendingKey);
      }
    }
  };

  const createEmptyGraph = async (
    document: TextDocument,
  ): Promise<GraphCacheEntry> => {
    const lintResult = await lintBirdConfig("", { uri: document.uri });
    return {
      entryUri: document.uri,
      visitedUris: new Set([document.uri]),
      symbolTable: lintResult.core.symbolTable,
      byUri: { [document.uri]: lintResult },
    };
  };

  const analyzeDocumentSnapshot = async (
    document: TextDocument,
    options: { publishRelatedDiagnostics: boolean },
    active: { uri: string; rootUri?: string },
  ): Promise<{ entryDiagnostics: Diagnostic[]; graph: GraphCacheEntry }> => {
    const generation = generationByUri.get(document.uri);
    const liveDocument = documents.get(document.uri);
    document = TextDocument.create(
      document.uri,
      document.languageId,
      document.version,
      document.getText(),
    );
    const openDocuments = documents.all().map((item) => ({
      uri: item.uri,
      version: item.version,
      text: item.getText(),
      document: item,
      generation: generationByUri.get(item.uri),
    }));
    const assertCurrent = (
      visitedUris: Iterable<string> = [document.uri],
    ): void => {
      if (
        generation !== generationByUri.get(document.uri) ||
        documents.get(document.uri) !== liveDocument ||
        liveDocument?.version !== document.version
      ) {
        throw new ResponseError(
          LSPErrorCodes.ContentModified,
          `Analysis superseded for ${document.uri}`,
        );
      }
      for (const uri of visitedUris) {
        const input = openDocuments.find((item) => item.uri === uri);
        if (
          input &&
          (documents.get(uri) !== input.document ||
            input.document.version !== input.version ||
            generationByUri.get(uri) !== input.generation)
        ) {
          const current = documents.get(document.uri);
          if (current) scheduler.schedule(current);
          throw new ResponseError(
            LSPErrorCodes.ContentModified,
            `Analysis input changed: ${uri}`,
          );
        }
      }
    };
    const settings = await getEditorSettings(document.uri);
    assertCurrent();
    if (settings.enabled === false) {
      const graph = await createEmptyGraph(document);
      assertCurrent();
      clearEntryTracking(document.uri);
      return { entryDiagnostics: [], graph };
    }
    const project = await resolveProjectForDocument(document);
    const workspaceRootUri =
      project.workspaceRootUri ??
      (project.entryUri.startsWith("file://")
        ? pathToFileURL(dirname(fileURLToPath(project.entryUri))).toString()
        : undefined);
    active.rootUri = workspaceRootUri;
    assertCurrent();
    const documentLimit = Math.min(
      project.maxDocumentBytes,
      project.maxTotalBytes,
    );
    if (Buffer.byteLength(document.getText(), "utf8") > documentLimit) {
      const graph = await createEmptyGraph(document);
      assertCurrent();
      clearEntryTracking(document.uri);
      return {
        entryDiagnostics: [
          {
            severity: 2,
            source: "birdcc",
            code: "analysis/size-limit",
            message: `Document exceeds the analysis size limit (${documentLimit} bytes)`,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
        ],
        graph,
      };
    }

    const eligible = await isDocumentEligible(document, project);
    assertCurrent();
    if (!eligible) {
      const graph = await createEmptyGraph(document);
      assertCurrent();
      clearEntryTracking(document.uri);
      parsedByUri.delete(document.uri);
      typeHintsByUri.delete(document.uri);
      graphByUri.set(document.uri, graph);
      return {
        entryDiagnostics: [],
        graph,
      };
    }

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
      await configWatchers.clearDependencies(document.uri);
      assertCurrent();
      const lintResult = await lintBirdConfig(document.getText(), {
        uri: document.uri,
      });
      lintResult.diagnostics = applyLintConfiguration(
        lintResult.diagnostics,
        project.config?.linter,
      );
      assertCurrent();
      if (options.publishRelatedDiagnostics) {
        clearEntryTracking(document.uri);
        publishedUrisByEntry.set(document.uri, new Set([document.uri]));
      }
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

    const crossFile = await resolveCrossFileReferences({
      entryUri: project.entryUri,
      documents: openDocuments,
      loadFromFileSystem: true,
      maxDepth: project.maxDepth,
      maxFiles: project.maxFiles,
      maxDocumentBytes: project.maxDocumentBytes,
      maxTotalBytes: project.maxTotalBytes,
      workspaceRootUri,
      allowIncludeOutsideWorkspace: project.allowIncludeOutsideWorkspace,
      includeSearchPaths: project.includeSearchPathUris,
    });

    const lintGraph = await lintResolvedCrossFileGraph(crossFile);
    if (!Object.hasOwn(lintGraph.byUri, document.uri)) {
      lintGraph.byUri[document.uri] = await lintBirdConfig(document.getText(), {
        uri: document.uri,
      });
    }
    for (const lintResult of Object.values(lintGraph.byUri)) {
      lintResult.diagnostics = applyLintConfiguration(
        lintResult.diagnostics,
        project.config?.linter,
      );
    }
    const disabledUris = new Set(
      (
        await Promise.all(
          Object.keys(lintGraph.byUri).map(async (uri) => ({
            uri,
            enabled: (await getEditorSettings(uri)).enabled,
          })),
        )
      )
        .filter((item) => item.enabled === false)
        .map((item) => item.uri),
    );
    const visitedUris = new Set(
      crossFile.visitedUris.length > 0
        ? crossFile.visitedUris
        : [project.entryUri],
    );
    visitedUris.add(document.uri);
    assertCurrent(visitedUris);

    const graph: GraphCacheEntry = {
      entryUri: document.uri,
      visitedUris,
      symbolTable: crossFile.symbolTable,
      byUri: lintGraph.byUri,
      workspaceRootUri,
      dependencyDirectoryUris: new Set([
        ...Object.keys(lintGraph.byUri)
          .filter((uri) => uri.startsWith("file://"))
          .map((uri) => pathToFileURL(dirname(fileURLToPath(uri))).toString()),
        ...Object.keys(lintGraph.byUri)
          .filter((uri) => uri.startsWith("file://"))
          .flatMap((uri) => {
            const directory = dirname(fileURLToPath(uri));
            return lintGraph.byUri[uri].parsed.program.declarations
              .filter((declaration) => declaration.kind === "include")
              .flatMap((declaration) =>
                declaration.kind === "include"
                  ? [
                      directory,
                      ...project.includeSearchPathUris.map((uri) =>
                        fileURLToPath(uri),
                      ),
                    ].map((base) =>
                      pathToFileURL(
                        dirname(
                          resolve(
                            base,
                            declaration.path.startsWith("file://")
                              ? fileURLToPath(declaration.path)
                              : declaration.path,
                          ),
                        ),
                      ).toString(),
                    )
                  : [],
              );
          }),
      ]),
    };

    const dependencyDirectories = [
      ...(graph.dependencyDirectoryUris ?? []),
    ].filter(
      (uri) =>
        project.allowIncludeOutsideWorkspace ||
        isWithinUri(uri, workspaceRootUri),
    );
    if (workspaceRootUris.length === 0 && document.uri.startsWith("file://")) {
      assertCurrent(visitedUris);
      await configWatchers.watchDependencies(
        document.uri,
        dependencyDirectories,
      );
      assertCurrent(visitedUris);
    }
    if (supportsDynamicFileWatching) {
      const directories = dependencyDirectories.filter(
        (uri) => !watchedDependencyDirectories.has(uri),
      );
      for (const uri of directories) watchedDependencyDirectories.add(uri);
      if (directories.length)
        void connection.client
          .register(DidChangeWatchedFilesNotification.type, {
            watchers: directories.map((baseUri) => ({
              globPattern: watchGlob(baseUri, "*"),
            })),
          })
          .catch((error) =>
            connection.console.error(
              `Unable to watch include directories: ${String(error)}`,
            ),
          );
    }

    for (const [uri, lintResult] of Object.entries(lintGraph.byUri)) {
      const snapshot = openDocuments.find((item) => item.uri === uri);
      parsedByUri.set(uri, {
        version: snapshot?.version ?? -1,
        parsed: lintResult.parsed,
      });
      graphByUri.set(uri, graph);
    }

    const diagnosticsByUri = new Map<string, Diagnostic[]>();
    for (const uri of visitedUris) {
      const lintResult = lintGraph.byUri[uri];
      diagnosticsByUri.set(
        uri,
        (
          lintResult?.diagnostics ??
          crossFile.diagnostics.filter((diagnostic) => diagnostic.uri === uri)
        ).map(toLspDiagnostic),
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
          if (disabledUris.has(uri)) {
            clearDiagnostics(connection, uri);
            continue;
          }
          publishDiagnostics(
            connection,
            uri,
            diagnostics,
            openDocuments.find((item) => item.uri === uri)?.version,
          );
        }
      }

      publishedUrisByEntry.set(document.uri, visitedUris);
    }

    return { entryDiagnostics, graph };
  };

  const analyzeDocument = async (
    document: TextDocument,
    options: { publishRelatedDiagnostics: boolean },
  ): Promise<{ entryDiagnostics: Diagnostic[]; graph: GraphCacheEntry }> => {
    const active: { uri: string; rootUri?: string } = { uri: document.uri };
    activeAnalyses.add(active);
    try {
      return await analyzeDocumentSnapshot(document, options, active);
    } finally {
      activeAnalyses.delete(active);
    }
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
      if (pendingGraphByUri.get(document.uri) === promise) {
        pendingGraphByUri.delete(document.uri);
      }
    }
  };

  connection.onInitialize((params): InitializeResult => {
    supportsConfiguration = Boolean(
      params.capabilities.workspace?.configuration,
    );
    supportsInlayHintRefresh = Boolean(
      params.capabilities.workspace?.inlayHint?.refreshSupport,
    );
    const markdownTags = params.capabilities.general?.markdown?.allowedTags;
    dn42Markup = ["h3", "p", "br", "table", "tr", "td", "hr", "span"].every(
      (tag) => markdownTags?.includes(tag),
    )
      ? "html"
      : "markdown";
    editorSettings = birdEditorSettingsSchema.parse(
      params.initializationOptions?.birdcc ?? {},
    );
    supportsDynamicFileWatching = Boolean(
      params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration,
    );
    supportsRelativeFileWatching = Boolean(
      params.capabilities.workspace?.didChangeWatchedFiles
        ?.relativePatternSupport,
    );
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
    updateDn42Settings();
    if (supportsDynamicFileWatching) {
      const patterns = [
        "**/bird.config.json",
        "**/birdcc.config.json",
        "**/*.conf",
        "**/*.bird",
      ];
      // Without a workspace root (single-file sessions), fall back to global globs.
      const watchers =
        workspaceRootUris.length > 0
          ? workspaceRootUris.flatMap((baseUri) =>
              patterns.map((pattern) => ({
                globPattern: watchGlob(baseUri, pattern),
              })),
            )
          : patterns.map((globPattern) => ({ globPattern }));
      void connection.client
        .register(DidChangeWatchedFilesNotification.type, { watchers })
        .catch((error) => {
          connection.console.log(
            `[project] failed to watch configuration files: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

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
    validate: async (textDocument): Promise<Diagnostic[] | undefined> => {
      const identity = documents.get(textDocument.uri);
      const version = textDocument.version;
      const generation = generationByUri.get(textDocument.uri);
      try {
        const analyzed = await analyzeDocument(textDocument, {
          publishRelatedDiagnostics: true,
        });
        return analyzed.entryDiagnostics;
      } catch (error) {
        if (
          documents.get(textDocument.uri) !== identity ||
          identity?.version !== version ||
          generationByUri.get(textDocument.uri) !== generation
        )
          return undefined;
        if (
          error instanceof ResponseError &&
          error.code === LSPErrorCodes.ContentModified
        )
          return undefined;
        if (
          error instanceof Error &&
          "configPath" in error &&
          typeof error.configPath === "string"
        ) {
          const uri = pathToFileURL(error.configPath).toString();
          configurationDiagnosticUris.add(uri);
          publishDiagnostics(connection, uri, [
            {
              ...toInternalErrorDiagnostic(error),
              code: "config/invalid",
              source: "birdcc-config",
            },
          ]);
          return [];
        }
        return [toInternalErrorDiagnostic(error)];
      }
    },
    publish: ({ uri, version, diagnostics }) => {
      publishDiagnostics(connection, uri, diagnostics, version);
    },
  });

  const invalidateAnalysis = (uri: string, filesystem = false): void => {
    const affected = new Set<string>([uri]);
    const configChanged =
      uri.startsWith("file://") &&
      PROJECT_CONFIG_FILE_NAMES.includes(basename(fileURLToPath(uri)));
    const configRoot = configChanged
      ? pathToFileURL(dirname(fileURLToPath(uri))).toString()
      : undefined;
    for (const [entryUri, visitedUris] of publishedUrisByEntry)
      if (visitedUris.has(uri)) affected.add(entryUri);
    for (const graph of new Set(graphByUri.values())) {
      const memberChanged =
        filesystem &&
        [...(graph.dependencyDirectoryUris ?? [])].some(
          (directoryUri) =>
            uri.startsWith("file://") &&
            (dirname(fileURLToPath(uri)) === fileURLToPath(directoryUri) ||
              isWithinUri(directoryUri, uri)),
        );
      if (
        graph.visitedUris.has(uri) ||
        memberChanged ||
        (configRoot && isWithinUri(graph.entryUri, configRoot))
      )
        affected.add(graph.entryUri);
    }
    for (const active of activeAnalyses) {
      if (
        active.uri === uri ||
        isWithinUri(uri, active.rootUri) ||
        (configRoot && isWithinUri(active.uri, configRoot))
      )
        affected.add(active.uri);
    }
    if (configRoot) {
      for (const document of documents.all())
        if (isWithinUri(document.uri, configRoot)) affected.add(document.uri);
      projectConfigGeneration += 1;
      announcedProjectConfigs.delete(fileURLToPath(uri));
    }
    for (const entryUri of affected) {
      generationByUri.set(entryUri, ++nextGeneration);
      pendingGraphByUri.delete(entryUri);
      eligibilityByUri.delete(entryUri);
      const document = documents.get(entryUri);
      if (document) scheduler.schedule(document);
    }
    for (const [key, graph] of graphByUri)
      if (affected.has(graph.entryUri)) graphByUri.delete(key);
    parsedByUri.delete(uri);
    typeHintsByUri.delete(uri);
  };

  connection.onDidChangeWatchedFiles((params) => {
    for (const change of params.changes) {
      if (!change.uri.startsWith("file://")) continue;
      const path = fileURLToPath(change.uri);
      const known = [...graphByUri.values()].some(
        (graph) =>
          graph.visitedUris.has(change.uri) ||
          [...(graph.dependencyDirectoryUris ?? [])].some(
            (directoryUri) =>
              dirname(path) === fileURLToPath(directoryUri) ||
              isWithinUri(directoryUri, change.uri),
          ),
      );
      if (
        !known &&
        path.split(/[\\/]/).some((part) => IGNORED_WATCH_DIRECTORIES.has(part))
      )
        continue;
      const config = PROJECT_CONFIG_FILE_NAMES.includes(basename(path));
      if (!known && !config && !/\.(conf|bird)$/.test(path)) continue;
      projectResolver.invalidate(change.uri);
      invalidateAnalysis(change.uri, true);
    }
  });

  connection.onDidChangeConfiguration((params) => {
    const validation = birdEditorSettingsSchema.safeParse(
      params.settings?.["bird2-lsp"] ?? params.settings?.birdcc ?? {},
    );
    if (!validation.success) {
      void connection.window.showErrorMessage(
        `Invalid BIRD editor settings: ${validation.error.message}`,
      );
      return;
    }
    editorSettings = validation.data;
    updateDn42Settings();
    settingsByUri.clear();
    projectConfigGeneration += 1;
    eligibilityByUri.clear();
    for (const document of documents.all()) invalidateAnalysis(document.uri);
    if (supportsInlayHintRefresh) void connection.languages.inlayHint.refresh();
  });

  documents.onDidOpen((event) => invalidateAnalysis(event.document.uri));
  documents.onDidChangeContent((event) =>
    invalidateAnalysis(event.document.uri),
  );

  documents.onDidClose((event) => {
    invalidateAnalysis(event.document.uri);
    parsedByUri.delete(event.document.uri);
    clearEntryTracking(event.document.uri);
    typeHintsByUri.delete(event.document.uri);
    eligibilityByUri.delete(event.document.uri);
    scheduler.close(event.document.uri);
    generationByUri.delete(event.document.uri);
    void configWatchers.unwatch(event.document.uri);
  });

  const getParsedDocument = async (
    document: TextDocument,
  ): Promise<ParsedBirdDocument> => {
    const cached = parsedByUri.get(document.uri);
    if (cached && cached.version === document.version) {
      return cached.parsed;
    }

    const version = document.version;
    const generation = generationByUri.get(document.uri);
    const parsed = await parseBirdConfig(document.getText());
    if (
      generation === generationByUri.get(document.uri) &&
      documents.get(document.uri) === document &&
      document.version === version
    ) {
      parsedByUri.set(document.uri, { version, parsed });
    }
    return parsed;
  };

  const getTypeHintsForDocument = async (
    document: TextDocument,
  ): Promise<readonly FunctionReturnHint[]> => {
    const cached = typeHintsByUri.get(document.uri);
    if (cached && cached.version === document.version) {
      return cached.hints;
    }

    const text = document.getText();
    const version = document.version;
    const generation = generationByUri.get(document.uri);
    const hints = await collectFunctionReturnHints(text);
    if (
      generation === generationByUri.get(document.uri) &&
      documents.get(document.uri) === document &&
      document.version === version
    ) {
      typeHintsByUri.set(document.uri, { version, hints });
    }
    return hints;
  };

  connection.onDocumentSymbol(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      if (!(await isDocumentEligible(document))) {
        return [];
      }
      const parsed = await getParsedDocument(document);
      return createDocumentSymbolsFromParsed(parsed);
    }),
  );

  connection.onHover(async (params) =>
    withDocument(documents, params.textDocument.uri, null, async (document) => {
      if (!(await isDocumentEligible(document))) {
        return null;
      }
      const settings = await getEditorSettings(document.uri);
      if (
        dn42Enabled &&
        settings.intel?.enabled !== false &&
        settings.intel?.hover !== false
      ) {
        const hover = await findDn42Hover(
          document.getText(),
          getLineText(document, params.position.line),
          params.position,
          (candidate) => {
            if (candidate.kind === "ip") {
              const info = dn42Intel.lookup(candidate.ip);
              return info && formatDn42IpHover(info, dn42Markup);
            }
            const info = dn42Intel.lookupAsn(candidate.asn);
            return info && formatDn42AsnHover(info, dn42Markup);
          },
        );
        if (hover)
          return {
            contents: { kind: "markdown", value: hover.value },
            range: toLspRange(hover.range),
          };
      }
      if (
        asnIntel.available &&
        settings.intel?.enabled !== false &&
        settings.intel?.hover !== false
      ) {
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
      if (!(await isDocumentEligible(document))) {
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
    }),
  );

  connection.onReferences(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      if (!(await isDocumentEligible(document))) {
        return [];
      }
      try {
        const graph = await getGraphForDocument(document);
        return createReferenceLocations(
          graph.symbolTable,
          document.uri,
          params.position,
          document.getText(),
          params.context.includeDeclaration,
        );
      } catch {
        return [];
      }
    }),
  );

  connection.onCompletion(async (params) =>
    withDocument(documents, params.textDocument.uri, [], async (document) => {
      if (!(await isDocumentEligible(document))) {
        return [];
      }
      const parsed = await getParsedDocument(document);
      const linePrefix = document.getText({
        start: { line: params.position.line, character: 0 },
        end: params.position,
      });

      // Check if we're in an ASN context — return ASN completions instead
      const settings = await getEditorSettings(document.uri);
      if (
        asnIntel.available &&
        settings.intel?.enabled !== false &&
        settings.intel?.completion !== false
      ) {
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
      if (!(await isDocumentEligible(document))) {
        return [];
      }
      try {
        const text = document.getText();
        const project = await resolveProjectForDocument(document);
        const settings = await getEditorSettings(document.uri);
        const formatOptions = {
          indentSize: params.options.tabSize,
          useTabs: !params.options.insertSpaces,
          ...settings.formatter,
          ...project.config?.formatter,
        };
        const result = await formatBirdConfig(text, formatOptions);
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
        throw new ResponseError(
          LSPErrorCodes.RequestFailed,
          `BIRD formatting failed: ${error instanceof Error ? error.message : String(error)}`,
        );
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
        if (!(await isDocumentEligible(document))) {
          return [];
        }
        const text = document.getText();
        const results: InlayHint[] = [];

        // ASN inlay hints
        const settings = await getEditorSettings(document.uri);
        if (
          asnIntel.available &&
          settings.intel?.enabled !== false &&
          settings.intel?.inlayHints !== false
        ) {
          results.push(...createAsnInlayHints(asnIntel, text, params.range));
        }

        // Function return type inlay hints
        if (
          settings.typeHints?.enabled !== false &&
          settings.typeHints?.inlay?.enabled !== false
        ) {
          try {
            const hints = await getTypeHintsForDocument(document);
            results.push(...createTypeHintInlayHints(hints, params.range));
          } catch (error) {
            connection.console.error(
              `[inlay] Function type inference failed for ${document.uri}: ${String(error)}`,
            );
          }
        }

        return results;
      },
    ),
  );

  connection.onShutdown(() => {
    hasShutdownBeenRequested = true;
    dn42Intel.dispose();
    return configWatchers.dispose();
  });

  connection.onExit(() => {
    dn42Intel.dispose();
    void configWatchers.dispose();
    if (!hasShutdownBeenRequested) {
      process.exitCode = 1;
    }
  });

  documents.listen(connection);
  connection.listen();
};
