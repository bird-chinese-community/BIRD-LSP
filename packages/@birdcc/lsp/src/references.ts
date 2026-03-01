import type { SymbolDefinition, SymbolReference, SymbolTable } from "@birdcc/core";
import type { Location, Position } from "vscode-languageserver/node.js";

interface SymbolTarget {
  kind?: SymbolDefinition["kind"] | SymbolReference["kind"];
  name: string;
}

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

const findTargetSymbol = (
  symbolTable: SymbolTable,
  uri: string,
  position: Position,
  sourceText: string,
): SymbolTarget | null => {
  const definition = symbolTable.definitions.find(
    (item) => item.uri === uri && containsPosition(item, position),
  );
  if (definition) {
    return { kind: definition.kind, name: definition.name };
  }

  const reference = symbolTable.references.find(
    (item) => item.uri === uri && containsPosition(item, position),
  );
  if (reference) {
    return { kind: reference.kind, name: reference.name };
  }

  const name = extractWordAtPosition(sourceText, position);
  if (!name) {
    return null;
  }

  const matchedDefinition = symbolTable.definitions.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  if (matchedDefinition) {
    return { kind: matchedDefinition.kind, name: matchedDefinition.name };
  }

  const matchedReference = symbolTable.references.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  if (matchedReference) {
    return { kind: matchedReference.kind, name: matchedReference.name };
  }

  return { name };
};

/** Resolves cross-file symbol references from a merged symbol table. */
export const createReferenceLocations = (
  symbolTable: SymbolTable,
  uri: string,
  position: Position,
  sourceText: string,
): Location[] => {
  const target = findTargetSymbol(symbolTable, uri, position, sourceText);
  if (!target) {
    return [];
  }

  const lowerName = target.name.toLowerCase();
  const definitionMatches = symbolTable.definitions.filter((item) => {
    if (item.name.toLowerCase() !== lowerName) {
      return false;
    }

    if (!target.kind) {
      return true;
    }

    return item.kind === target.kind;
  });

  const referenceMatches = symbolTable.references.filter((item) => {
    if (item.name.toLowerCase() !== lowerName) {
      return false;
    }

    if (!target.kind) {
      return true;
    }

    return item.kind === target.kind;
  });

  return dedupeLocations([...definitionMatches, ...referenceMatches].map(toLocation));
};
