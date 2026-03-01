import type { SymbolDefinition, SymbolReference } from "@birdcc/core";
import type { Location, Position } from "vscode-languageserver/node.js";

export interface SymbolLookupIndex {
  definitionsByName: Map<string, SymbolDefinition[]>;
  referencesByName: Map<string, SymbolReference[]>;
}

const addToMapList = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
};

export const containsPosition = (
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

export const toLocation = (symbol: SymbolDefinition | SymbolReference): Location => ({
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

export const extractWordAtPosition = (text: string, position: Position): string => {
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

export const dedupeLocations = (locations: Location[]): Location[] => {
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

export const createSymbolLookupIndex = (
  definitions: SymbolDefinition[],
  references: SymbolReference[],
): SymbolLookupIndex => {
  const definitionsByName = new Map<string, SymbolDefinition[]>();
  const referencesByName = new Map<string, SymbolReference[]>();

  for (const definition of definitions) {
    addToMapList(definitionsByName, definition.name.toLowerCase(), definition);
  }

  for (const reference of references) {
    addToMapList(referencesByName, reference.name.toLowerCase(), reference);
  }

  return {
    definitionsByName,
    referencesByName,
  };
};
