import {
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { ParsedBirdDocument } from "@birdcc/parser";
import {
  declarationMetadata,
  isPositionInRange,
  KEYWORD_DOCS,
  toLspRange,
} from "./shared.js";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const keywordAtPosition = (
  document: TextDocument,
  position: Position,
): { word: string; range: Range } | null => {
  const text = document.getText();
  const positionOffset = document.offsetAt(position);

  if (positionOffset < 0 || positionOffset > text.length) {
    return null;
  }

  const keywords = Object.keys(KEYWORD_DOCS).sort(
    (left, right) => right.length - left.length,
  );
  for (const keyword of keywords) {
    const keywordPattern = new RegExp(
      `\\b${escapeRegExp(keyword).replaceAll("\\ ", "\\\\s+")}\\b`,
      "gi",
    );
    let match = keywordPattern.exec(text);

    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (positionOffset >= start && positionOffset <= end) {
        return {
          word: keyword,
          range: {
            start: document.positionAt(start),
            end: document.positionAt(end),
          },
        };
      }

      match = keywordPattern.exec(text);
    }
  }

  const isWordChar = (char: string): boolean => /[A-Za-z_]/.test(char);

  let start = positionOffset;
  while (start > 0 && isWordChar(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = positionOffset;
  while (end < text.length && isWordChar(text[end] ?? "")) {
    end += 1;
  }

  if (start === end) {
    return null;
  }

  const word = text.slice(start, end).toLowerCase();
  const startPosition = document.positionAt(start);
  const endPosition = document.positionAt(end);

  return {
    word,
    range: {
      start: startPosition,
      end: endPosition,
    },
  };
};

export const createHoverFromParsed = (
  parsed: ParsedBirdDocument,
  document: TextDocument,
  position: Position,
): Hover | null => {
  for (const declaration of parsed.program.declarations) {
    const metadata = declarationMetadata(declaration);
    if (!metadata || !isPositionInRange(position, metadata.selectionRange)) {
      continue;
    }

    return {
      contents: {
        kind: "markdown",
        value: metadata.hoverMarkdown,
      },
      range: toLspRange(metadata.selectionRange),
    };
  }

  const keyword = keywordAtPosition(document, position);
  if (!keyword) {
    return null;
  }

  const keywordDoc = KEYWORD_DOCS[keyword.word];
  if (!keywordDoc) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: `**${keyword.word}**\n\n${keywordDoc}`,
    },
    range: keyword.range,
  };
};
