import { open, opendir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  normalize,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ParsedBirdDocument, SourceRange } from "@birdcc/parser";
import type {
  BirdDiagnostic,
  CoreSnapshot,
  CrossFileResolveOptions,
  CrossFileResolutionResult,
  CrossFileResolutionStats,
  SymbolTable,
} from "./types.js";
import { buildCoreSnapshotFromParsed } from "./snapshot.js";
import {
  mergeSymbolTables,
  pushSymbolTableDiagnostics,
} from "./symbol-table.js";
import { collectCircularTemplateDiagnostics } from "./template-cycles.js";
import { createParsedDocumentCache } from "./parsed-document-cache.js";

export const DEFAULT_CROSS_FILE_MAX_DEPTH = 16;
export const DEFAULT_CROSS_FILE_MAX_FILES = 256;
export const DEFAULT_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_BYTES = 16 * 1024 * 1024;

const parsedDocumentCache = createParsedDocumentCache({
  maxEntries: 512,
  maxBytes: 16 * 1024 * 1024,
});

const DEFAULT_RANGE = {
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 1,
} as const;

const isFileUri = (uri: string): boolean => uri.startsWith("file://");

const toFilePath = (uri: string): string | null => {
  if (isFileUri(uri)) {
    return fileURLToPath(uri);
  }

  if (uri.startsWith("/")) {
    return uri;
  }

  return null;
};

const normalizeUriForPrefixMatch = (uri: string): string =>
  uri.replace(/\/+$/, "");

const toDefaultWorkspaceRootUri = (entryUri: string): string => {
  const entryPath = toFilePath(entryUri);
  if (entryPath) {
    return pathToFileURL(dirname(entryPath)).toString();
  }

  return normalize(dirname(entryUri));
};

const isWithinWorkspaceRoot = (
  candidateUri: string,
  workspaceRootUri: string,
): boolean => {
  const candidatePath = toFilePath(candidateUri);
  const workspaceRootPath = toFilePath(workspaceRootUri);

  if (candidatePath && workspaceRootPath) {
    const resolvedRoot = normalize(workspaceRootPath);
    const resolvedCandidate = normalize(candidatePath);
    const relPath = relative(resolvedRoot, resolvedCandidate);

    return (
      relPath.length === 0 ||
      (!relPath.startsWith("..") && !isAbsolute(relPath))
    );
  }

  const normalizedRoot = normalizeUriForPrefixMatch(
    normalize(workspaceRootUri),
  );
  const normalizedCandidate = normalizeUriForPrefixMatch(
    normalize(candidateUri),
  );
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
};

export const readBirdConfigFile = async (
  uri: string,
  maxBytes: number,
): Promise<string> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new Error("maxBytes must be a non-negative safe integer");
  const filePath = toFilePath(uri);
  if (!filePath) {
    throw new Error(`Unsupported non-file URI '${uri}'`);
  }

  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile())
      throw new Error(`Expected a regular file: '${uri}'`);
    if (metadata.size > maxBytes)
      throw new Error(
        `Analysis size limit (${maxBytes} bytes) exceeded: '${uri}'`,
      );
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maxBytes)
        throw new Error(
          `Analysis size limit (${maxBytes} bytes) exceeded: '${uri}'`,
        );
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    await handle.close();
  }
};

const resolveIncludeUri = (baseUri: string, includePath: string): string => {
  if (includePath.startsWith("file://")) {
    return pathToFileURL(normalize(fileURLToPath(includePath))).toString();
  }

  if (isFileUri(baseUri)) {
    const basePath = fileURLToPath(baseUri);
    const resolvedPath = resolve(dirname(basePath), includePath);
    return pathToFileURL(resolvedPath).toString();
  }

  return normalize(resolve(dirname(baseUri), includePath));
};

const normalizeIncludeSearchPathUri = (searchPath: string): string => {
  if (searchPath.startsWith("file://")) {
    return pathToFileURL(normalize(fileURLToPath(searchPath))).toString();
  }

  if (isAbsolute(searchPath)) {
    return pathToFileURL(normalize(searchPath)).toString();
  }

  return normalize(searchPath);
};

const resolveIncludeUriFromSearchPath = (
  searchPathUri: string,
  includePath: string,
): string => {
  if (isFileUri(searchPathUri)) {
    const resolvedPath = resolve(fileURLToPath(searchPathUri), includePath);
    return pathToFileURL(resolvedPath).toString();
  }

  return normalize(resolve(searchPathUri, includePath));
};

const includePathSuffixes = (includePath: string): string[] => {
  const normalizedPath = includePath.replace(/^[/\\]+/, "");
  if (normalizedPath.length === 0) {
    return [];
  }

  const segments = normalizedPath.split(/[/\\]+/).filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const suffixes: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    suffixes.push(segments.slice(index).join("/"));
  }

  const base = basename(includePath);
  if (base.length > 0 && !suffixes.includes(base)) {
    suffixes.push(base);
  }

  return suffixes;
};

const resolveIncludeCandidateUris = (
  baseUri: string,
  includePath: string,
  includeSearchPaths: string[],
): string[] => {
  const directUri = resolveIncludeUri(baseUri, includePath);
  if (includePath.startsWith("file://") || includeSearchPaths.length === 0) {
    return [directUri];
  }

  const uniqueUris = new Set<string>([directUri]);
  const suffixes = includePathSuffixes(includePath);

  for (const searchPath of includeSearchPaths) {
    uniqueUris.add(resolveIncludeUriFromSearchPath(searchPath, includePath));
    for (const suffix of suffixes) {
      uniqueUris.add(resolveIncludeUriFromSearchPath(searchPath, suffix));
    }
  }

  return [...uniqueUris];
};

const wildcardPatternToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\*/g, ".*")}$`);
};

const expandWildcardIncludeUri = async (
  includeUri: string,
  knownDocumentUris: Iterable<string>,
  workspaceRootUri?: string,
  loadFromFileSystem = true,
  directoryBudget = { remaining: 20_000 },
): Promise<string[]> => {
  const filePath = toFilePath(includeUri);
  if (!filePath || !filePath.includes("*")) {
    return [includeUri];
  }

  const filePattern = basename(filePath);
  if (!filePattern.includes("*")) {
    return [includeUri];
  }

  const includeDir = dirname(filePath);
  const regex = wildcardPatternToRegExp(filePattern);

  const includeDirUri = pathToFileURL(includeDir).toString();
  const canReadDirectory = async (): Promise<boolean> => {
    if (!loadFromFileSystem) return false;
    if (!workspaceRootUri) return true;
    if (!isWithinWorkspaceRoot(includeDirUri, workspaceRootUri)) return false;
    const rootPath = toFilePath(workspaceRootUri);
    if (!rootPath) return false;
    try {
      return isWithinWorkspaceRoot(
        pathToFileURL(await realpath(includeDir)).toString(),
        pathToFileURL(await realpath(rootPath)).toString(),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  if (!(await canReadDirectory())) {
    const hasResolvedPath = (item: {
      uri: string;
      path: string | null;
    }): item is { uri: string; path: string } => item.path !== null;

    return [...knownDocumentUris]
      .map((uri) => ({ uri, path: toFilePath(uri) }))
      .filter(hasResolvedPath)
      .filter((item) => dirname(item.path) === includeDir)
      .filter((item) => regex.test(basename(item.path)))
      .map((item) => item.uri)
      .sort((left, right) => left.localeCompare(right));
  }

  try {
    const directory = await opendir(includeDir);
    const matches: string[] = [];
    for await (const entry of directory) {
      if (directoryBudget.remaining <= 0)
        throw new Error("Wildcard directory entry limit reached");
      directoryBudget.remaining -= 1;
      if (entry.isFile() && regex.test(entry.name))
        matches.push(pathToFileURL(resolve(includeDir, entry.name)).toString());
    }
    return matches.sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (
      !["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      throw error;
    const hasResolvedPath = (item: {
      uri: string;
      path: string | null;
    }): item is { uri: string; path: string } => item.path !== null;

    const matched = [...knownDocumentUris]
      .map((uri) => ({ uri, path: toFilePath(uri) }))
      .filter(hasResolvedPath)
      .filter((item) => dirname(item.path) === includeDir)
      .filter((item) => regex.test(basename(item.path)))
      .map((item) => item.uri)
      .sort((left, right) => left.localeCompare(right));

    return matched;
  }
};

const includeDiagnostic = (
  uri: string,
  message: string,
  range: SourceRange = DEFAULT_RANGE,
): BirdDiagnostic => ({
  code: "semantic/missing-include",
  message,
  severity: "warning",
  source: "core",
  uri,
  range: {
    line: range.line,
    column: range.column,
    endLine: range.endLine,
    endColumn: range.endColumn,
  },
});

const dedupeDiagnostics = (diagnostics: BirdDiagnostic[]): BirdDiagnostic[] => {
  const seen = new Set<string>();
  const output: BirdDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.uri ?? "",
      diagnostic.range.line,
      diagnostic.range.column,
      diagnostic.range.endLine,
      diagnostic.range.endColumn,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(diagnostic);
  }

  return output;
};

const parseDocumentWithCache = async (
  uri: string,
  text: string,
  stats: CrossFileResolutionStats,
): Promise<ParsedBirdDocument> => {
  const { parsed, cacheHit } = await parsedDocumentCache.parse(uri, text);
  if (cacheHit) {
    stats.parsedCacheHits += 1;
  } else stats.parsedCacheMisses += 1;
  return parsed;
};

interface QueueItem {
  uri: string;
  depth: number;
}

export const resolveCrossFileReferences = async (
  options: CrossFileResolveOptions,
): Promise<CrossFileResolutionResult> => {
  const maxDepth = options.maxDepth ?? DEFAULT_CROSS_FILE_MAX_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_CROSS_FILE_MAX_FILES;
  const loadFromFileSystem = options.loadFromFileSystem ?? true;
  const maxDocumentBytes =
    options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const directoryBudget = { remaining: 20_000 };
  for (const [name, value] of Object.entries({
    maxDepth,
    maxFiles,
    maxDocumentBytes,
    maxTotalBytes,
  })) {
    const minimum = name === "maxDepth" ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error(
        `${name} must be a safe integer greater than or equal to ${minimum}`,
      );
  }
  const workspaceRootUri =
    options.workspaceRootUri ?? toDefaultWorkspaceRootUri(options.entryUri);
  const allowIncludeOutsideWorkspace =
    options.allowIncludeOutsideWorkspace ?? false;
  const includeSearchPaths = (options.includeSearchPaths ?? []).map(
    normalizeIncludeSearchPathUri,
  );

  const stats: CrossFileResolutionStats = {
    loadedFromMemory: options.documents?.length ?? 0,
    loadedFromFileSystem: 0,
    skippedByDepth: 0,
    skippedByFileLimit: 0,
    missingIncludes: 0,
    parsedCacheHits: 0,
    parsedCacheMisses: 0,
    skippedBySizeLimit: 0,
    totalBytes: 0,
  };

  const documentMap = new Map(
    (options.documents ?? []).map((document) => [
      document.uri,
      { uri: document.uri, text: document.text },
    ]),
  );
  const parsedDocuments = new Map<string, ParsedBirdDocument>();
  const snapshots: Record<string, CoreSnapshot> = {};
  const queue: QueueItem[] = [{ uri: options.entryUri, depth: 0 }];
  const queued = new Set<string>([options.entryUri]);
  const visited = new Set<string>();
  const diagnostics: BirdDiagnostic[] = [];
  const budgetedUris = new Set<string>();

  const ensureDocument = async (
    uri: string,
    sourceUri = uri,
    range: SourceRange = DEFAULT_RANGE,
    loadDiagnostics = diagnostics,
  ): Promise<boolean> => {
    if (budgetedUris.has(uri)) return true;
    if (!documentMap.has(uri) && !loadFromFileSystem) {
      return false;
    }

    try {
      let text = documentMap.get(uri)?.text;
      if (text === undefined) {
        const path = toFilePath(uri);
        const root = toFilePath(workspaceRootUri);
        const readUri =
          !options.readFileText && path
            ? pathToFileURL(await realpath(path)).toString()
            : uri;
        if (
          !allowIncludeOutsideWorkspace &&
          path &&
          root &&
          !options.readFileText
        ) {
          const actualRoot = pathToFileURL(await realpath(root)).toString();
          if (!isWithinWorkspaceRoot(readUri, actualRoot)) {
            loadDiagnostics.push(
              includeDiagnostic(
                sourceUri,
                `Include target is outside workspace root: '${uri}'`,
                range,
              ),
            );
            return false;
          }
        }
        const remaining = Math.min(
          maxDocumentBytes,
          maxTotalBytes - stats.totalBytes,
        );
        text = options.readFileText
          ? await options.readFileText(uri)
          : await readBirdConfigFile(readUri, remaining);
        stats.loadedFromFileSystem += 1;
      }
      const bytes = Buffer.byteLength(text, "utf8");
      if (
        bytes > maxDocumentBytes ||
        stats.totalBytes + bytes > maxTotalBytes
      ) {
        stats.skippedBySizeLimit += 1;
        loadDiagnostics.push(
          includeDiagnostic(
            sourceUri,
            `Analysis size limit exceeded for '${uri}'`,
            range,
          ),
        );
        return false;
      }
      documentMap.set(uri, { uri, text });
      budgetedUris.add(uri);
      stats.totalBytes += bytes;
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Analysis size limit")
      )
        stats.skippedBySizeLimit += 1;
      loadDiagnostics.push(
        includeDiagnostic(
          sourceUri,
          `Unable to load '${uri}': ${error instanceof Error ? error.message : String(error)}`,
          range,
        ),
      );
      return false;
    }
  };

  if (!(await ensureDocument(options.entryUri))) {
    return {
      entryUri: options.entryUri,
      visitedUris: [],
      symbolTable: { definitions: [], references: [] },
      snapshots: {},
      documents: {},
      parsedDocuments: {},
      diagnostics: [
        ...diagnostics,
        includeDiagnostic(
          options.entryUri,
          `Entry file not found or not readable: '${options.entryUri}'`,
        ),
      ],
      stats,
    };
  }

  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (visited.has(current.uri)) {
      continue;
    }

    if (current.depth > maxDepth) {
      stats.skippedByDepth += 1;
      continue;
    }

    if (visited.size >= maxFiles) {
      stats.skippedByFileLimit += 1;
      diagnostics.push(
        includeDiagnostic(
          current.uri,
          `Cross-file analysis stopped after reaching max files limit (${maxFiles})`,
        ),
      );
      break;
    }

    visited.add(current.uri);

    const document = documentMap.get(current.uri);
    if (!document) {
      continue;
    }

    const parsed = await parseDocumentWithCache(
      current.uri,
      document.text,
      stats,
    );
    parsedDocuments.set(current.uri, parsed);
    snapshots[current.uri] = buildCoreSnapshotFromParsed(parsed, {
      uri: current.uri,
      typeCheck: options.typeCheck,
    });

    for (const declaration of parsed.program.declarations) {
      if (declaration.kind !== "include" || declaration.path.length === 0) {
        continue;
      }

      const includeRange = declaration.pathRange;
      const includeCandidates = resolveIncludeCandidateUris(
        current.uri,
        declaration.path,
        includeSearchPaths,
      );
      const allowMultipleMatches = declaration.path.includes("*");
      const candidateDiagnostics: BirdDiagnostic[] = [];
      let queuedInclude = false;
      let skippedOutsideWorkspace = false;

      if (current.depth + 1 > maxDepth) {
        stats.skippedByDepth += 1;
        diagnostics.push(
          includeDiagnostic(
            current.uri,
            `Include skipped due to max depth (${maxDepth}): '${declaration.path}'`,
            includeRange,
          ),
        );
        continue;
      }

      for (const includeUri of includeCandidates) {
        // eslint-disable-next-line no-await-in-loop
        let expandedIncludeUris: string[];
        try {
          expandedIncludeUris = await expandWildcardIncludeUri(
            includeUri,
            documentMap.keys(),
            allowIncludeOutsideWorkspace ? undefined : workspaceRootUri,
            loadFromFileSystem,
            directoryBudget,
          );
        } catch (error) {
          diagnostics.push(
            includeDiagnostic(
              current.uri,
              `Unable to expand include '${declaration.path}': ${error instanceof Error ? error.message : String(error)}`,
              includeRange,
            ),
          );
          continue;
        }
        if (expandedIncludeUris.length === 0) {
          continue;
        }

        for (const expandedUri of expandedIncludeUris) {
          if (
            !allowIncludeOutsideWorkspace &&
            !isWithinWorkspaceRoot(expandedUri, workspaceRootUri)
          ) {
            skippedOutsideWorkspace = true;
            continue;
          }

          if (visited.has(expandedUri) || queued.has(expandedUri)) {
            queuedInclude = true;
            if (!allowMultipleMatches) {
              break;
            }
            continue;
          }

          if (visited.size + (queue.length - queueIndex) >= maxFiles) {
            stats.skippedByFileLimit += 1;
            diagnostics.push(
              includeDiagnostic(
                current.uri,
                `Include skipped due to max files limit (${maxFiles}): '${declaration.path}'`,
                includeRange,
              ),
            );
            queuedInclude = true;
            break;
          }

          // eslint-disable-next-line no-await-in-loop
          const loaded = await ensureDocument(
            expandedUri,
            current.uri,
            includeRange,
            candidateDiagnostics,
          );
          if (!loaded) {
            continue;
          }

          queue.push({ uri: expandedUri, depth: current.depth + 1 });
          queued.add(expandedUri);
          queuedInclude = true;
          if (!allowMultipleMatches) {
            break;
          }
        }

        if (queuedInclude && !allowMultipleMatches) {
          break;
        }
      }

      if (!queuedInclude || allowMultipleMatches) {
        diagnostics.push(...candidateDiagnostics);
      }

      if (queuedInclude) {
        continue;
      }

      if (skippedOutsideWorkspace) {
        diagnostics.push(
          includeDiagnostic(
            current.uri,
            `Include skipped outside workspace root '${workspaceRootUri}': '${declaration.path}'`,
            includeRange,
          ),
        );
        continue;
      }

      stats.missingIncludes += 1;
      diagnostics.push(
        includeDiagnostic(
          current.uri,
          `Included file not found in workspace: '${declaration.path}'`,
          includeRange,
        ),
      );
    }
  }

  const mergedSymbolTable: SymbolTable = mergeSymbolTables(
    Object.values(snapshots).map((snapshot) => snapshot.symbolTable),
  );
  pushSymbolTableDiagnostics(mergedSymbolTable, diagnostics);

  for (const [uri, snapshot] of Object.entries(snapshots)) {
    for (const diagnostic of snapshot.diagnostics) {
      if (
        diagnostic.code === "semantic/duplicate-definition" ||
        diagnostic.code === "semantic/undefined-reference" ||
        diagnostic.code === "semantic/circular-template"
      ) {
        continue;
      }

      diagnostics.push({
        ...diagnostic,
        uri,
      });
    }
  }

  diagnostics.push(
    ...collectCircularTemplateDiagnostics(
      [...parsedDocuments.entries()].map(([uri, parsed]) => ({ uri, parsed })),
    ),
  );

  return {
    entryUri: options.entryUri,
    visitedUris: [...visited],
    symbolTable: mergedSymbolTable,
    snapshots,
    documents: Object.fromEntries(
      [...documentMap.entries()]
        .filter(([uri]) => visited.has(uri))
        .map(([uri, document]) => [uri, document.text]),
    ),
    parsedDocuments: Object.fromEntries(parsedDocuments),
    diagnostics: dedupeDiagnostics(diagnostics),
    stats,
  };
};
