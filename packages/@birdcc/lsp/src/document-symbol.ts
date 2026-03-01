import type { DocumentSymbol } from "vscode-languageserver/node.js";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { declarationMetadata, toLspRange } from "./shared.js";

export const createDocumentSymbolsFromParsed = (parsed: ParsedBirdDocument): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];

  for (const declaration of parsed.program.declarations) {
    const metadata = declarationMetadata(declaration);
    if (!metadata) {
      continue;
    }

    symbols.push({
      name: metadata.symbolName,
      detail: metadata.detail,
      kind: metadata.symbolKind,
      range: toLspRange(declaration),
      selectionRange: toLspRange(metadata.selectionRange),
      children: [],
    });
  }

  return symbols;
};
