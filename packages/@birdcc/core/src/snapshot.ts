import type { ParsedBirdDocument } from "@birdcc/parser";
import type { CoreSnapshot, TypeCheckOptions } from "./types.js";
import { buildSymbolTableFromParsed, pushSymbolTableDiagnostics } from "./symbol-table.js";
import { collectSemanticDiagnostics } from "./semantic-diagnostics.js";
import { checkTypes } from "./type-checker.js";

export const buildCoreSnapshotFromParsed = (
  parsed: ParsedBirdDocument,
  options: { uri?: string; typeCheck?: TypeCheckOptions } = {},
): CoreSnapshot => {
  const symbolTable = buildSymbolTableFromParsed(parsed, { uri: options.uri });
  const diagnostics = collectSemanticDiagnostics(parsed);
  pushSymbolTableDiagnostics(symbolTable, diagnostics);

  const typeDiagnostics = checkTypes(parsed.program, symbolTable, {
    ...options.typeCheck,
    uri: options.uri,
  });

  return {
    symbols: symbolTable.definitions,
    references: symbolTable.references,
    symbolTable,
    typeDiagnostics,
    diagnostics: [...diagnostics, ...typeDiagnostics],
  };
};
