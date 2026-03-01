import { dirname, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseBirdConfig } from "@birdcc/parser";
import type {
  BirdDiagnostic,
  CoreSnapshot,
  CrossFileResolutionResult,
  SymbolTable,
  TypeCheckOptions,
} from "./types.js";
import { buildCoreSnapshotFromParsed } from "./snapshot.js";
import { mergeSymbolTables, pushSymbolTableDiagnostics } from "./symbol-table.js";
import { collectCircularTemplateDiagnostics } from "./template-cycles.js";

const isFileUri = (uri: string): boolean => uri.startsWith("file://");

const resolveIncludeUri = (baseUri: string, includePath: string): string => {
  if (includePath.startsWith("file://")) {
    return includePath;
  }

  if (
    includePath.startsWith("/") ||
    includePath.startsWith("./") ||
    includePath.startsWith("../")
  ) {
    if (isFileUri(baseUri)) {
      const basePath = fileURLToPath(baseUri);
      const resolvedPath = resolve(dirname(basePath), includePath);
      return pathToFileURL(resolvedPath).toString();
    }

    return normalize(resolve(dirname(baseUri), includePath));
  }

  if (isFileUri(baseUri)) {
    const basePath = fileURLToPath(baseUri);
    const resolvedPath = resolve(dirname(basePath), includePath);
    return pathToFileURL(resolvedPath).toString();
  }

  return normalize(resolve(dirname(baseUri), includePath));
};

const collectMissingIncludeDiagnostics = async (
  snapshots: Record<string, CoreSnapshot>,
  documentMap: Map<string, { uri: string; text: string }>,
): Promise<BirdDiagnostic[]> => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const uri of Object.keys(snapshots)) {
    const document = documentMap.get(uri);
    if (!document) {
      continue;
    }

    const parsed = await parseBirdConfig(document.text);
    for (const declaration of parsed.program.declarations) {
      if (declaration.kind !== "include" || declaration.path.length === 0) {
        continue;
      }

      const includeUri = resolveIncludeUri(uri, declaration.path);
      if (documentMap.has(includeUri)) {
        continue;
      }

      diagnostics.push({
        code: "semantic/missing-include",
        message: `Included file not found in workspace: '${declaration.path}'`,
        severity: "warning",
        source: "core",
        range: declaration.pathRange,
      });
    }
  }

  return diagnostics;
};

export const resolveCrossFileReferences = async (options: {
  entryUri: string;
  documents: Array<{ uri: string; text: string }>;
  maxDepth?: number;
  typeCheck?: TypeCheckOptions;
}): Promise<CrossFileResolutionResult> => {
  const maxDepth = options.maxDepth ?? 16;
  const documentMap = new Map(options.documents.map((document) => [document.uri, document]));
  const parsedDocuments = new Map<string, Awaited<ReturnType<typeof parseBirdConfig>>>();
  const snapshots: Record<string, CoreSnapshot> = {};
  const queue: Array<{ uri: string; depth: number }> = [{ uri: options.entryUri, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (visited.has(current.uri) || current.depth > maxDepth) {
      continue;
    }

    visited.add(current.uri);

    const document = documentMap.get(current.uri);
    if (!document) {
      continue;
    }

    const parsed = await parseBirdConfig(document.text);
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
      if (!visited.has(includeUri)) {
        queue.push({ uri: includeUri, depth: current.depth + 1 });
      }
    }
  }

  const mergedSymbolTable: SymbolTable = mergeSymbolTables(
    Object.values(snapshots).map((snapshot) => snapshot.symbolTable),
  );

  const diagnostics: BirdDiagnostic[] = [];
  pushSymbolTableDiagnostics(mergedSymbolTable, diagnostics);

  for (const snapshot of Object.values(snapshots)) {
    for (const diagnostic of snapshot.diagnostics) {
      if (
        diagnostic.code === "semantic/duplicate-definition" ||
        diagnostic.code === "semantic/undefined-reference" ||
        diagnostic.code === "semantic/circular-template"
      ) {
        continue;
      }

      diagnostics.push(diagnostic);
    }
  }

  diagnostics.push(...(await collectMissingIncludeDiagnostics(snapshots, documentMap)));
  diagnostics.push(...collectCircularTemplateDiagnostics([...parsedDocuments.values()]));

  return {
    entryUri: options.entryUri,
    visitedUris: [...visited],
    symbolTable: mergedSymbolTable,
    snapshots,
    diagnostics,
  };
};
