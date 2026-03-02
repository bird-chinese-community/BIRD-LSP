import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ParsedBirdDocument, SourceRange } from "@birdcc/parser";
import { parseBirdConfig } from "@birdcc/parser";
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

export const DEFAULT_CROSS_FILE_MAX_DEPTH = 16;
export const DEFAULT_CROSS_FILE_MAX_FILES = 256;

const PARSED_DOCUMENT_CACHE_LIMIT = 512;
const parsedDocumentCache = new Map<
  string,
  { text: string; parsed: ParsedBirdDocument }
>();

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

const defaultReadFileText = async (uri: string): Promise<string> => {
  const filePath = toFilePath(uri);
  if (!filePath) {
    throw new Error(`Unsupported non-file URI '${uri}'`);
  }

  return readFile(filePath, "utf8");
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
  const cached = parsedDocumentCache.get(uri);
  if (cached && cached.text === text) {
    stats.parsedCacheHits += 1;
    return cached.parsed;
  }

  stats.parsedCacheMisses += 1;
  const parsed = await parseBirdConfig(text);

  if (parsedDocumentCache.size >= PARSED_DOCUMENT_CACHE_LIMIT) {
    const oldestKey = parsedDocumentCache.keys().next().value;
    if (oldestKey) {
      parsedDocumentCache.delete(oldestKey);
    }
  }

  parsedDocumentCache.set(uri, { text, parsed });
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
  const readFileText = options.readFileText ?? defaultReadFileText;
  const workspaceRootUri =
    options.workspaceRootUri ?? toDefaultWorkspaceRootUri(options.entryUri);
  const allowIncludeOutsideWorkspace =
    options.allowIncludeOutsideWorkspace ?? false;

  const stats: CrossFileResolutionStats = {
    loadedFromMemory: options.documents?.length ?? 0,
    loadedFromFileSystem: 0,
    skippedByDepth: 0,
    skippedByFileLimit: 0,
    missingIncludes: 0,
    parsedCacheHits: 0,
    parsedCacheMisses: 0,
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

  const ensureDocument = async (uri: string): Promise<boolean> => {
    if (documentMap.has(uri)) {
      return true;
    }

    if (!loadFromFileSystem) {
      return false;
    }

    try {
      const text = await readFileText(uri);
      documentMap.set(uri, { uri, text });
      stats.loadedFromFileSystem += 1;
      return true;
    } catch {
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
      diagnostics: [
        includeDiagnostic(
          options.entryUri,
          `Entry file not found or not readable: '${options.entryUri}'`,
        ),
      ],
      stats,
    };
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

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

      const includeUri = resolveIncludeUri(current.uri, declaration.path);
      const includeRange = declaration.pathRange;

      if (
        !allowIncludeOutsideWorkspace &&
        !isWithinWorkspaceRoot(includeUri, workspaceRootUri)
      ) {
        diagnostics.push(
          includeDiagnostic(
            current.uri,
            `Include skipped outside workspace root '${workspaceRootUri}': '${declaration.path}'`,
            includeRange,
          ),
        );
        continue;
      }

      if (visited.has(includeUri) || queued.has(includeUri)) {
        continue;
      }

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

      if (visited.size + queue.length >= maxFiles) {
        stats.skippedByFileLimit += 1;
        diagnostics.push(
          includeDiagnostic(
            current.uri,
            `Include skipped due to max files limit (${maxFiles}): '${declaration.path}'`,
            includeRange,
          ),
        );
        continue;
      }

      const loaded = await ensureDocument(includeUri);
      if (!loaded) {
        stats.missingIncludes += 1;
        diagnostics.push(
          includeDiagnostic(
            current.uri,
            `Included file not found in workspace: '${declaration.path}'`,
            includeRange,
          ),
        );
        continue;
      }

      queue.push({ uri: includeUri, depth: current.depth + 1 });
      queued.add(includeUri);
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
      [...documentMap.entries()].map(([uri, document]) => [uri, document.text]),
    ),
    diagnostics: dedupeDiagnostics(diagnostics),
    stats,
  };
};
