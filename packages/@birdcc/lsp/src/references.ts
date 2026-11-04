import type {
  SymbolDefinition,
  SymbolReference,
  SymbolTable,
} from "@birdcc/core";
import type { Location, Position } from "vscode-languageserver/node.js";
import {
  containsPosition,
  createSymbolLookupIndex,
  dedupeLocations,
  extractWordAtPosition,
  lookupSymbolDefinitions,
  toLocation,
} from "./symbol-utils.js";

interface SymbolTarget {
  kind?: SymbolDefinition["kind"] | SymbolReference["kind"];
  name: string;
}

const findTargetSymbol = (
  symbolTable: SymbolTable,
  index: ReturnType<typeof createSymbolLookupIndex>,
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

  const matchedDefinition = lookupSymbolDefinitions(index, name)[0];
  if (matchedDefinition) {
    return { kind: matchedDefinition.kind, name: matchedDefinition.name };
  }

  const matchedReference = (index.referencesByName.get(name) ?? [])[0];
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
  const index = createSymbolLookupIndex(
    symbolTable.definitions,
    symbolTable.references,
  );
  const target = findTargetSymbol(
    symbolTable,
    index,
    uri,
    position,
    sourceText,
  );
  if (!target) {
    return [];
  }

  const definitionMatches = lookupSymbolDefinitions(index, target.name).filter(
    (item) => !target.kind || item.kind === target.kind,
  );

  const referenceMatches = (
    index.referencesByName.get(target.name) ?? []
  ).filter((item) => {
    if (!target.kind) {
      return true;
    }

    return item.kind === target.kind;
  });

  return dedupeLocations(
    [...definitionMatches, ...referenceMatches].map(toLocation),
  );
};
