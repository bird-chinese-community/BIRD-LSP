import type { ParsedBirdDocument } from "@birdcc/parser";
import type {
  BirdDiagnostic,
  BirdSymbolKind,
  SymbolDefinition,
  SymbolReference,
  SymbolTable,
} from "./types.js";
import { createRange } from "./range.js";

export const DEFAULT_DOCUMENT_URI = "memory://bird.conf";

const declarationToSymbol = (
  declaration: ParsedBirdDocument["program"]["declarations"][number],
  uri: string,
): SymbolDefinition | null => {
  const toSymbol = (
    kind: BirdSymbolKind,
    name: string,
    nameRange: {
      line: number;
      column: number;
      endLine: number;
      endColumn: number;
    },
  ): SymbolDefinition => ({
    kind,
    name,
    line: nameRange.line,
    column: nameRange.column,
    endLine: nameRange.endLine,
    endColumn: nameRange.endColumn,
    uri,
  });

  if (declaration.kind === "protocol") {
    if (declaration.name.trim().length === 0) {
      return null;
    }
    return toSymbol("protocol", declaration.name, declaration.nameRange);
  }

  if (declaration.kind === "template") {
    if (declaration.name.trim().length === 0) {
      return null;
    }
    return toSymbol("template", declaration.name, declaration.nameRange);
  }

  if (declaration.kind === "filter") {
    if (declaration.name.trim().length === 0) {
      return null;
    }
    return toSymbol("filter", declaration.name, declaration.nameRange);
  }

  if (declaration.kind === "function") {
    if (declaration.name.trim().length === 0) {
      return null;
    }
    return toSymbol("function", declaration.name, declaration.nameRange);
  }

  if (declaration.kind === "table") {
    if (declaration.name.trim().length === 0) {
      return null;
    }
    return toSymbol("table", declaration.name, declaration.nameRange);
  }

  return null;
};

export const buildSymbolTableFromParsed = (
  parsed: ParsedBirdDocument,
  options: { uri?: string } = {},
): SymbolTable => {
  const uri = options.uri ?? DEFAULT_DOCUMENT_URI;
  const definitions: SymbolDefinition[] = [];
  const references: SymbolReference[] = [];

  for (const declaration of parsed.program.declarations) {
    const symbol = declarationToSymbol(declaration, uri);
    if (symbol) {
      definitions.push(symbol);
    }

    if (declaration.kind === "protocol" && declaration.fromTemplate) {
      const range = declaration.fromTemplateRange ?? {
        line: declaration.line,
        column: declaration.column,
        endLine: declaration.endLine,
        endColumn: declaration.endColumn,
      };

      references.push({
        kind: "template",
        name: declaration.fromTemplate,
        line: range.line,
        column: range.column,
        endLine: range.endLine,
        endColumn: range.endColumn,
        uri,
      });
    }

    if (declaration.kind === "template" && declaration.fromTemplate) {
      const range = declaration.fromTemplateRange ?? {
        line: declaration.line,
        column: declaration.column,
        endLine: declaration.endLine,
        endColumn: declaration.endColumn,
      };

      references.push({
        kind: "template",
        name: declaration.fromTemplate,
        line: range.line,
        column: range.column,
        endLine: range.endLine,
        endColumn: range.endColumn,
        uri,
      });
    }
  }

  return { definitions, references };
};

export const mergeSymbolTables = (tables: SymbolTable[]): SymbolTable => {
  const definitions: SymbolDefinition[] = [];
  const references: SymbolReference[] = [];

  for (const table of tables) {
    definitions.push(...table.definitions);
    references.push(...table.references);
  }

  return { definitions, references };
};

export const pushSymbolTableDiagnostics = (
  symbolTable: SymbolTable,
  diagnostics: BirdDiagnostic[],
): void => {
  const seenDefinitions = new Map<string, SymbolDefinition>();

  for (const symbol of symbolTable.definitions) {
    const key = `${symbol.kind}:${symbol.name.toLowerCase()}`;
    const previous = seenDefinitions.get(key);

    if (previous) {
      diagnostics.push({
        code: "semantic/duplicate-definition",
        message: `${symbol.kind} '${symbol.name}' is already defined`,
        severity: "error",
        source: "core",
        uri: symbol.uri,
        range: createRange(symbol.line, symbol.column, symbol.name.length),
      });
      continue;
    }

    seenDefinitions.set(key, symbol);
  }

  for (const reference of symbolTable.references) {
    const key = `template:${reference.name.toLowerCase()}`;
    if (seenDefinitions.has(key)) {
      continue;
    }

    diagnostics.push({
      code: "semantic/undefined-reference",
      message: `Undefined template reference '${reference.name}'`,
      severity: "error",
      source: "core",
      uri: reference.uri,
      range: createRange(
        reference.line,
        reference.column,
        reference.name.length,
      ),
    });
  }
};
