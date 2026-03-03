import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { z } from "zod";

const hoverDocsFileSchema = z.object({
  entries: z.array(
    z.object({
      keyword: z.string().min(1),
      description: z.string().min(1),
      detail: z.string().min(1),
    }),
  ),
});

interface HoverDocEntry {
  readonly title: string;
  readonly summary: string;
  readonly details?: readonly string[];
}

interface LineWord {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface ResolvedHoverTopic {
  readonly key: string;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly doc: HoverDocEntry;
}

const WORD_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;
const HOVER_DOCS_PATH = new URL("../../data/hover-docs.yaml", import.meta.url);

let hoverDocsPromise: Promise<ReadonlyMap<string, HoverDocEntry>> | undefined;

const toHoverDocsMap = (
  source: z.infer<typeof hoverDocsFileSchema>,
): ReadonlyMap<string, HoverDocEntry> =>
  new Map(
    source.entries.map((entry) => [
      entry.keyword.toLowerCase(),
      {
        title: entry.description,
        summary: entry.detail,
      },
    ]),
  );

export const loadBirdHoverDocs = async (): Promise<
  ReadonlyMap<string, HoverDocEntry>
> => {
  hoverDocsPromise ??= (async () => {
    const yamlText = await readFile(HOVER_DOCS_PATH, "utf8");
    const parsed = parse(yamlText);
    const file = hoverDocsFileSchema.parse(parsed);
    return toHoverDocsMap(file);
  })();

  return hoverDocsPromise;
};

const collectLineWords = (lineText: string): readonly LineWord[] => {
  const words: LineWord[] = [];
  for (const match of lineText.matchAll(WORD_PATTERN)) {
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

const toCandidate = (
  words: readonly LineWord[],
  startIndex: number,
  endIndex: number,
) => {
  if (startIndex < 0 || endIndex >= words.length || startIndex > endIndex) {
    return null;
  }

  const key = words
    .slice(startIndex, endIndex + 1)
    .map((word) => word.value)
    .join(" ");

  return {
    key,
    startCharacter: words[startIndex].start,
    endCharacter: words[endIndex].end,
  };
};

export const resolveBirdHoverTopic = (
  lineText: string,
  character: number,
  docs: ReadonlyMap<string, HoverDocEntry>,
): ResolvedHoverTopic | undefined => {
  const words = collectLineWords(lineText);
  if (words.length === 0) {
    return undefined;
  }

  const focusedWordIndex = words.findIndex(
    (word) => character >= word.start && character <= word.end,
  );
  if (focusedWordIndex === -1) {
    return undefined;
  }

  const rawCandidates = [
    toCandidate(words, focusedWordIndex - 1, focusedWordIndex + 1),
    toCandidate(words, focusedWordIndex, focusedWordIndex + 2),
    toCandidate(words, focusedWordIndex - 1, focusedWordIndex),
    toCandidate(words, focusedWordIndex, focusedWordIndex + 1),
    toCandidate(words, focusedWordIndex, focusedWordIndex),
  ].filter(
    (candidate): candidate is NonNullable<typeof candidate> => !!candidate,
  );

  for (const candidate of rawCandidates) {
    const doc = docs.get(candidate.key);
    if (!doc) {
      continue;
    }

    return {
      ...candidate,
      doc,
    };
  }

  return undefined;
};
