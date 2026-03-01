import { parseBirdConfig } from "@birdcc/parser";
import { resolveCrossFileReferences } from "./cross-file.js";
import { buildCoreSnapshotFromParsed } from "./snapshot.js";

export type {
  BirdDiagnostic,
  BirdDiagnosticSeverity,
  BirdRange,
  BirdSymbolKind,
  CoreSnapshot,
  CrossFileDocumentInput,
  CrossFileResolveOptions,
  CrossFileResolutionResult,
  CrossFileResolutionStats,
  SymbolDefinition,
  SymbolReference,
  SymbolTable,
  TypeCheckOptions,
  TypeValue,
} from "./types.js";

export { checkTypes } from "./type-checker.js";
export {
  DEFAULT_DOCUMENT_URI,
  buildSymbolTableFromParsed,
  mergeSymbolTables,
  pushSymbolTableDiagnostics,
} from "./symbol-table.js";
export { buildCoreSnapshotFromParsed } from "./snapshot.js";
export { resolveCrossFileReferences } from "./cross-file.js";

/** Parses and builds semantic snapshot in one async call. */
export const buildCoreSnapshot = async (text: string) => {
  const parsed = await parseBirdConfig(text);
  return buildCoreSnapshotFromParsed(parsed);
};

export type ResolveCrossFileReferences = typeof resolveCrossFileReferences;
