import {
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { ParsedBirdDocument } from "@birdcc/parser";
import { declarationMetadata, KEYWORD_DOCS } from "./shared.js";
import { resolveHoverKeywordDoc } from "./hover-docs.js";
import { resolveHoverContextPath } from "./hover-context.js";
import {
  toCanonicalKey,
  isPositionInRange,
  toLspRange,
  getLineText,
} from "./utils.js";

interface LineWord {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

interface ResolvedKeywordDoc {
  readonly keyword: string;
  readonly doc: string;
}

interface ResolvedKeywordHit {
  readonly word: string;
  readonly doc: string;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

export interface KeywordHoverResolutionOptions {
  readonly contextPath?: readonly string[];
}

export interface ResolvedKeywordHover {
  readonly key: string;
  readonly markdown: string;
  readonly startCharacter: number;
  readonly endCharacter: number;
}

const HOVER_WORD_PATTERN =
  /(?:\.[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)/g;

const toKeyAliases = (keyword: string): readonly string[] => {
  const canonicalKey = toCanonicalKey(keyword);
  const aliases = new Set<string>();

  const addAlias = (value: string): void => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    aliases.add(normalized);
    if (normalized.startsWith(".")) {
      aliases.add(normalized.slice(1));
      return;
    }

    if (!normalized.includes(" ")) {
      aliases.add(`.${normalized}`);
    }
  };

  addAlias(canonicalKey);
  addAlias(canonicalKey.replace(/[_-]+/g, " "));
  if (canonicalKey.includes(" ")) {
    addAlias(canonicalKey.replace(/\s+/g, "_"));
    addAlias(canonicalKey.replace(/\s+/g, "-"));
  }

  return [...aliases];
};

const toKeywordWordCount = (keyword: string): number =>
  keyword
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

const keywordDocsByAlias = new Map<string, ResolvedKeywordDoc>();
const keywordWordCounts = [
  ...new Set(Object.keys(KEYWORD_DOCS).map(toKeywordWordCount)),
].sort((left, right) => right - left);

for (const [keyword, doc] of Object.entries(KEYWORD_DOCS)) {
  const canonicalKeyword = toCanonicalKey(keyword);
  const resolved: ResolvedKeywordDoc = {
    keyword: canonicalKeyword,
    doc,
  };

  for (const alias of toKeyAliases(canonicalKeyword)) {
    if (!keywordDocsByAlias.has(alias)) {
      keywordDocsByAlias.set(alias, resolved);
    }
  }
}

const getLineTextFromDocument = (
  document: TextDocument,
  line: number,
): string => getLineText(document, line);

const collectLineWords = (lineText: string): readonly LineWord[] => {
  const words: LineWord[] = [];
  for (const match of lineText.matchAll(HOVER_WORD_PATTERN)) {
    const value = match[0];
    const start = match.index ?? 0;
    words.push({
      value: value.toLowerCase(),
      start,
      end: start + value.length,
    });
  }

  return words;
};

const resolveFocusedWordIndex = (
  words: readonly LineWord[],
  character: number,
): number => {
  const exactIndex = words.findIndex(
    (word) => character >= word.start && character < word.end,
  );
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const boundaryIndex = words.findIndex((word) => character === word.end);
  if (boundaryIndex !== -1) {
    return boundaryIndex;
  }

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    if (character > word.end && character - word.end <= 1) {
      return index;
    }
  }

  return -1;
};

const findResolvedKeywordDoc = (
  candidateKey: string,
): ResolvedKeywordDoc | undefined => {
  for (const alias of toKeyAliases(candidateKey)) {
    const resolved = keywordDocsByAlias.get(alias);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
};

const keywordAtLine = (
  lineText: string,
  character: number,
): ResolvedKeywordHit | null => {
  const words = collectLineWords(lineText);
  if (words.length === 0) {
    return null;
  }

  const focusedWordIndex = resolveFocusedWordIndex(words, character);
  if (focusedWordIndex === -1) {
    return null;
  }

  for (const phraseLength of keywordWordCounts) {
    if (phraseLength < 1 || phraseLength > words.length) {
      continue;
    }

    const minStart = Math.max(0, focusedWordIndex - phraseLength + 1);
    const maxStart = Math.min(focusedWordIndex, words.length - phraseLength);
    for (let startIndex = minStart; startIndex <= maxStart; startIndex += 1) {
      const endIndex = startIndex + phraseLength - 1;
      const key = words
        .slice(startIndex, endIndex + 1)
        .map((word) => word.value)
        .join(" ");
      const resolved = findResolvedKeywordDoc(key);
      if (!resolved) {
        continue;
      }

      return {
        word: resolved.keyword,
        doc: resolved.doc,
        startCharacter: words[startIndex].start,
        endCharacter: words[endIndex].end,
      };
    }
  }

  return null;
};

export const resolveKeywordHoverOnLine = (
  lineText: string,
  character: number,
  options?: KeywordHoverResolutionOptions,
): ResolvedKeywordHover | null => {
  const keyword = keywordAtLine(lineText, character);
  if (!keyword) {
    return null;
  }

  // Prefer context-aware docs from hover-docs.ts (already self-contained
  // with a keyword heading). Fall back to the static KEYWORD_DOCS value
  // and wrap it with a heading to keep the format consistent.
  const resolvedDoc = resolveHoverKeywordDoc(keyword.word, {
    contextPath: options?.contextPath,
  });
  const markdown = resolvedDoc ?? `## \`${keyword.word}\`\n\n${keyword.doc}`;

  return {
    key: keyword.word,
    markdown,
    startCharacter: keyword.startCharacter,
    endCharacter: keyword.endCharacter,
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

  if (position.line < 0 || position.line >= document.lineCount) {
    return null;
  }

  const lineText = getLineTextFromDocument(document, position.line);
  const contextPath = resolveHoverContextPath(
    document,
    position.line,
    position.character,
  );
  const keyword = resolveKeywordHoverOnLine(lineText, position.character, {
    contextPath,
  });
  if (!keyword) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: keyword.markdown,
    },
    range: {
      start: {
        line: position.line,
        character: keyword.startCharacter,
      },
      end: {
        line: position.line,
        character: keyword.endCharacter,
      },
    } satisfies Range,
  };
};
