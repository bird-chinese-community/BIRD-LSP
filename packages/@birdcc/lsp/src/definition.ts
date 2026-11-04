import type { SymbolTable } from "@birdcc/core";
import type { Location, Position } from "vscode-languageserver/node.js";
import {
  containsPosition,
  createSymbolLookupIndex,
  dedupeLocations,
  extractWordAtPosition,
  lookupSymbolDefinitions,
  toLocation,
} from "./symbol-utils.js";

/** Resolves symbol definition locations from a merged cross-file symbol table. */
export const createDefinitionLocations = (
  symbolTable: SymbolTable,
  uri: string,
  position: Position,
  sourceText: string,
): Location[] => {
  const index = createSymbolLookupIndex(
    symbolTable.definitions,
    symbolTable.references,
  );

  const reference = symbolTable.references.find(
    (item) => item.uri === uri && containsPosition(item, position),
  );

  if (reference) {
    return dedupeLocations(
      lookupSymbolDefinitions(index, reference.name)
        .filter((definition) => definition.kind === reference.kind)
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

  return dedupeLocations(lookupSymbolDefinitions(index, name).map(toLocation));
};
