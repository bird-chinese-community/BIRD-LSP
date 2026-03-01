import type { SymbolDefinition, SymbolReference, SymbolTable } from "@birdcc/core";
import type { Location, Position } from "vscode-languageserver/node.js";

const containsPosition = (
  range: { line: number; column: number; endLine: number; endColumn: number },
  position: Position,
): boolean => {
  const line = position.line + 1;
  const column = position.character + 1;

  if (line < range.line || line > range.endLine) {
    return false;
  }

  if (line === range.line && column < range.column) {
    return false;
  }

  if (line === range.endLine && column > range.endColumn) {
    return false;
  }

  return true;
};

const toLocation = (symbol: SymbolDefinition | SymbolReference): Location => ({
  uri: symbol.uri,
  range: {
    start: {
      line: Math.max(0, symbol.line - 1),
      character: Math.max(0, symbol.column - 1),
    },
    end: {
      line: Math.max(0, symbol.endLine - 1),
      character: Math.max(0, symbol.endColumn - 1),
    },
  },
});

const extractWordAtPosition = (text: string, position: Position): string => {
  const lineText = text.split(/\r?\n/)[position.line] ?? "";
  if (position.character < 0 || position.character > lineText.length) {
    return "";
  }

  let start = position.character;
  while (start > 0 && /[A-Za-z0-9_]/.test(lineText[start - 1] ?? "")) {
    start -= 1;
  }

  let end = position.character;
  while (end < lineText.length && /[A-Za-z0-9_]/.test(lineText[end] ?? "")) {
    end += 1;
  }

  return lineText.slice(start, end).trim();
};

const dedupeLocations = (locations: Location[]): Location[] => {
  const seen = new Set<string>();
  const output: Location[] = [];

  for (const location of locations) {
    const key = [
      location.uri,
      location.range.start.line,
      location.range.start.character,
      location.range.end.line,
      location.range.end.character,
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(location);
  }

  return output;
};

/** Resolves symbol definition locations from a merged cross-file symbol table. */
export const createDefinitionLocations = (
  symbolTable: SymbolTable,
  uri: string,
  position: Position,
  sourceText: string,
): Location[] => {
  const reference = symbolTable.references.find(
    (item) => item.uri === uri && containsPosition(item, position),
  );

  if (reference) {
    return dedupeLocations(
      symbolTable.definitions
        .filter(
          (definition) =>
            definition.kind === reference.kind &&
            definition.name.toLowerCase() === reference.name.toLowerCase(),
        )
        .map(toLocation),
    );
  }

  const definition = symbolTable.definitions.find(
    (item) => item.uri === uri && containsPosition(item, position),
  );
  if (definition) {
    return [toLocation(definition)];
  }

  const name = extractWordAtPosition(sourceText, position);
  if (!name) {
    return [];
  }

  return dedupeLocations(
    symbolTable.definitions
      .filter((item) => item.name.toLowerCase() === name.toLowerCase())
      .map(toLocation),
  );
};
