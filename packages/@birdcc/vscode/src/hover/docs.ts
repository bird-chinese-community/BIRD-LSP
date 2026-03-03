import { readdir, readFile } from "node:fs/promises";

import { parse } from "yaml";
import { z } from "zod";

const hoverDocParameterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().optional(),
});

const hoverDocEntrySchema = z.object({
  keyword: z.string().min(1),
  description: z.string().min(1),
  detail: z.string().min(1),
  details: z.array(z.string().min(1)).optional(),
  version: z.string().min(1).optional(),
  diff: z.string().min(1).optional(),
  anchor: z.string().min(1).optional(),
  anchors: z.record(z.string(), z.string().min(1)).optional(),
  notes: z.record(z.string(), z.string().min(1)).optional(),
  usage: z.string().min(1).optional(),
  path: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  related: z.array(z.string().min(1)).optional(),
  parameters: z.array(hoverDocParameterSchema).optional(),
});

const hoverDocsFileSchema = z.object({
  version: z.number().optional(),
  baseUrls: z.record(z.string(), z.string().url()).optional(),
  entries: z.array(hoverDocEntrySchema).default([]),
});

const hoverUsageEntrySchema = z.object({
  keyword: z.string().min(1),
  usage: z.string().min(1),
  path: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
});

const hoverUsageFileSchema = z.object({
  version: z.number().optional(),
  entries: z.array(hoverUsageEntrySchema).default([]),
});

export interface HoverDocLink {
  readonly label: string;
  readonly url: string;
}

interface HoverDocEntry {
  readonly keyword: string;
  readonly title: string;
  readonly summary: string;
  readonly details?: readonly string[];
  readonly version?: string;
  readonly diff?: string;
  readonly notes?: Readonly<Record<string, string>>;
  readonly usage?: string;
  readonly path?: string | readonly string[];
  readonly normalizedPaths?: readonly (readonly string[])[];
  readonly related?: readonly string[];
  readonly parameters?: readonly z.infer<typeof hoverDocParameterSchema>[];
  readonly links?: readonly HoverDocLink[];
  readonly usageCandidates?: readonly UsageEntry[];
}

export interface HoverDocsCollection {
  readonly docs: ReadonlyMap<string, HoverDocEntry>;
  readonly docsByKey: ReadonlyMap<string, readonly HoverDocEntry[]>;
  readonly maxKeywordWordCount: number;
  readonly keywordWordCounts: readonly number[];
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

export interface HoverResolutionOptions {
  readonly contextPath?: readonly string[];
}

const WORD_PATTERN = /(?:\.[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)/g;
const HOVER_DOCS_DIR = new URL("../../data/hover-docs/", import.meta.url);
const HOVER_USAGE_DIR = new URL("../../data/hover-usage/", import.meta.url);

let hoverDocsPromise: Promise<HoverDocsCollection> | undefined;

const toAnchorUrl = (baseUrl: string, anchor: string): string =>
  `${baseUrl.replace(/#$/, "")}#${anchor}`;

const toLinks = (
  entry: z.infer<typeof hoverDocEntrySchema>,
  baseUrls: Readonly<Record<string, string>>,
): readonly HoverDocLink[] => {
  if (entry.anchors) {
    return Object.entries(entry.anchors)
      .flatMap(([versionKey, anchor]) => {
        const baseUrl = baseUrls[versionKey];
        if (!baseUrl) {
          return [];
        }

        return {
          label: `BIRD ${versionKey.toUpperCase()} docs`,
          url: toAnchorUrl(baseUrl, anchor),
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  if (!entry.anchor) {
    return [];
  }

  const preferredBaseUrl =
    entry.version?.startsWith("v3") === true
      ? (baseUrls.v3 ?? baseUrls.v2)
      : (baseUrls.v2 ?? baseUrls.v3);
  if (!preferredBaseUrl) {
    return [];
  }

  return [
    {
      label: "BIRD docs",
      url: toAnchorUrl(preferredBaseUrl, entry.anchor),
    },
  ];
};

const toKeywordWordCount = (keyword: string): number =>
  keyword
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

const toCanonicalKey = (keyword: string): string =>
  keyword.trim().toLowerCase().replace(/\s+/g, " ");

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

const normalizePathSegments = (pathValue: string): readonly string[] =>
  pathValue
    .toLowerCase()
    .split(/[./]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const toNormalizedPaths = (
  pathValue: string | readonly string[] | undefined,
): readonly (readonly string[])[] => {
  if (!pathValue) {
    return [];
  }

  if (typeof pathValue === "string") {
    return [normalizePathSegments(pathValue)];
  }

  return pathValue.map((item) => normalizePathSegments(item));
};

interface UsageEntry {
  readonly keyword: string;
  readonly usage: string;
  readonly normalizedPaths: readonly (readonly string[])[];
}

const resolveDefaultUsage = (
  entries: readonly UsageEntry[] | undefined,
): string | undefined => {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const genericEntry = entries.find(
    (entry) => entry.normalizedPaths.length === 0,
  );
  if (genericEntry) {
    return genericEntry.usage;
  }

  return entries[0]?.usage;
};

const scoreUsageForContext = (
  usageEntry: UsageEntry,
  contextPath: readonly string[] | undefined,
): number => {
  if (!contextPath || contextPath.length === 0) {
    return usageEntry.normalizedPaths.length > 0 ? -1 : 0;
  }

  const normalizedContext = contextPath.map((segment) => segment.toLowerCase());
  if (usageEntry.normalizedPaths.length === 0) {
    return 0;
  }

  let bestScore = -1;
  for (const usagePath of usageEntry.normalizedPaths) {
    if (usagePath.length > normalizedContext.length) {
      continue;
    }

    let matches = true;
    for (let index = 0; index < usagePath.length; index += 1) {
      if (usagePath[index] !== normalizedContext[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      bestScore = Math.max(bestScore, usagePath.length);
    }
  }

  return bestScore;
};

const resolveUsageForContext = (
  doc: HoverDocEntry,
  contextPath: readonly string[] | undefined,
): string | undefined => {
  const entries = doc.usageCandidates ?? [];
  if (!entries || entries.length === 0) {
    return doc.usage;
  }

  let selectedUsage: string | undefined = doc.usage;
  let selectedScore = doc.usage ? 0 : Number.NEGATIVE_INFINITY;
  for (const usageEntry of entries) {
    const score = scoreUsageForContext(usageEntry, contextPath);
    if (score > selectedScore) {
      selectedUsage = usageEntry.usage;
      selectedScore = score;
    }
  }

  return selectedUsage;
};

const loadYamlFragments = async <T extends z.ZodTypeAny>(
  directoryUrl: URL,
  schema: T,
): Promise<readonly z.infer<T>[]> => {
  const fileNames = (await readdir(directoryUrl))
    .filter((fileName) => fileName.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));
  if (fileNames.length === 0) {
    return [];
  }

  const fragments: z.infer<T>[] = [];
  for (const fileName of fileNames) {
    const fileUrl = new URL(fileName, directoryUrl);
    const yamlText = await readFile(fileUrl, "utf8");
    const parsed = parse(yamlText);
    fragments.push(schema.parse(parsed));
  }

  return fragments;
};

const toHoverDocsCollection = (
  source: z.infer<typeof hoverDocsFileSchema>,
  usageMap: ReadonlyMap<string, readonly UsageEntry[]>,
): HoverDocsCollection => {
  const baseUrls = source.baseUrls ?? {};
  const entries = source.entries.map((entry) => {
    const keyword = toCanonicalKey(entry.keyword);
    const normalizedPaths = toNormalizedPaths(entry.path);
    const usageCandidates = usageMap.get(keyword) ?? [];
    const docEntry: HoverDocEntry = {
      keyword,
      title: entry.description,
      summary: entry.detail,
      details: entry.details,
      version: entry.version,
      diff: entry.diff,
      notes: entry.notes,
      usage: entry.usage ?? resolveDefaultUsage(usageCandidates),
      path: entry.path,
      normalizedPaths,
      related: entry.related,
      parameters: entry.parameters,
      links: toLinks(entry, baseUrls),
      usageCandidates,
    };

    return [keyword, docEntry] as const;
  });

  const maxKeywordWordCount = source.entries.reduce(
    (maxCount, entry) => Math.max(maxCount, toKeywordWordCount(entry.keyword)),
    1,
  );
  const keywordWordCountSet = new Set<number>();
  for (const entry of source.entries) {
    keywordWordCountSet.add(toKeywordWordCount(entry.keyword));
  }
  const keywordWordCounts = [...keywordWordCountSet].sort(
    (left, right) => right - left,
  );
  const docsByKey = new Map<string, HoverDocEntry[]>();
  for (const [, docEntry] of entries) {
    for (const keyAlias of toKeyAliases(docEntry.keyword)) {
      const existing = docsByKey.get(keyAlias) ?? [];
      existing.push(docEntry);
      docsByKey.set(keyAlias, existing);
    }
  }

  return {
    docs: new Map(entries),
    docsByKey,
    maxKeywordWordCount,
    keywordWordCounts,
  };
};

export const loadBirdHoverDocs = async (): Promise<HoverDocsCollection> => {
  hoverDocsPromise ??= (async () => {
    const docFragments = await loadYamlFragments(
      HOVER_DOCS_DIR,
      hoverDocsFileSchema,
    );
    if (docFragments.length === 0) {
      throw new Error("No hover docs yaml fragments found");
    }

    const mergedEntries: z.infer<typeof hoverDocEntrySchema>[] = [];
    let mergedVersion: number | undefined;
    let mergedBaseUrls: Record<string, string> = {};

    for (const fragment of docFragments) {
      if (fragment.version !== undefined) {
        mergedVersion = fragment.version;
      }
      if (fragment.baseUrls) {
        mergedBaseUrls = {
          ...mergedBaseUrls,
          ...fragment.baseUrls,
        };
      }
      if (fragment.entries.length > 0) {
        mergedEntries.push(...fragment.entries);
      }
    }

    const usageFragments = await loadYamlFragments(
      HOVER_USAGE_DIR,
      hoverUsageFileSchema,
    );
    const usageMap = new Map<string, UsageEntry[]>();
    for (const fragment of usageFragments) {
      for (const usageEntry of fragment.entries) {
        const keyword = toCanonicalKey(usageEntry.keyword);
        const existing = usageMap.get(keyword) ?? [];
        existing.push({
          keyword,
          usage: usageEntry.usage,
          normalizedPaths: toNormalizedPaths(usageEntry.path),
        });
        usageMap.set(keyword, existing);
      }
    }

    const mergedFile = hoverDocsFileSchema.parse({
      version: mergedVersion,
      baseUrls: mergedBaseUrls,
      entries: mergedEntries,
    });

    if (
      !mergedFile.baseUrls ||
      typeof mergedFile.baseUrls.v2 !== "string" ||
      typeof mergedFile.baseUrls.v3 !== "string"
    ) {
      throw new Error("Hover docs baseUrls.v2 and baseUrls.v3 are required");
    }

    return toHoverDocsCollection(mergedFile, usageMap);
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

type HoverDocsLookup = HoverDocsCollection | ReadonlyMap<string, HoverDocEntry>;

const toLookup = (
  source: HoverDocsLookup,
): {
  readonly docs: ReadonlyMap<string, HoverDocEntry>;
  readonly docsByKey: ReadonlyMap<string, readonly HoverDocEntry[]>;
  readonly maxKeywordWordCount: number;
  readonly keywordWordCounts: readonly number[];
} => {
  if (
    "docs" in source &&
    "docsByKey" in source &&
    "maxKeywordWordCount" in source &&
    "keywordWordCounts" in source
  ) {
    return source;
  }

  const docsByKey = new Map<string, HoverDocEntry[]>();
  const keywordWordCountSet = new Set<number>();
  for (const [key, entry] of source.entries()) {
    keywordWordCountSet.add(toKeywordWordCount(key));
    for (const keyAlias of toKeyAliases(key)) {
      docsByKey.set(keyAlias, [entry]);
    }
  }
  const keywordWordCounts = [...keywordWordCountSet].sort(
    (left, right) => right - left,
  );

  return {
    docs: source,
    docsByKey,
    maxKeywordWordCount: keywordWordCounts[0] ?? 1,
    keywordWordCounts,
  };
};

const findDocsForCandidate = (
  docsByKey: ReadonlyMap<string, readonly HoverDocEntry[]>,
  candidateKey: string,
): readonly HoverDocEntry[] | undefined => {
  for (const alias of toKeyAliases(candidateKey)) {
    const docs = docsByKey.get(alias);
    if (docs && docs.length > 0) {
      return docs;
    }
  }

  return undefined;
};

const scoreDocForContext = (
  doc: HoverDocEntry,
  contextPath: readonly string[] | undefined,
): number => {
  if (!contextPath || contextPath.length === 0) {
    return doc.normalizedPaths && doc.normalizedPaths.length > 0 ? -1 : 0;
  }

  if (!doc.normalizedPaths || doc.normalizedPaths.length === 0) {
    return 0;
  }

  const normalizedContext = contextPath.map((segment) => segment.toLowerCase());
  let bestScore = -1;

  for (const pathSegments of doc.normalizedPaths) {
    if (
      pathSegments.length === 0 ||
      pathSegments.length > normalizedContext.length
    ) {
      continue;
    }

    let matches = true;
    for (let index = 0; index < pathSegments.length; index += 1) {
      if (normalizedContext[index] !== pathSegments[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      bestScore = Math.max(bestScore, pathSegments.length);
    }
  }

  return bestScore;
};

const selectDocByContext = (
  docs: readonly HoverDocEntry[],
  contextPath: readonly string[] | undefined,
): HoverDocEntry | undefined => {
  let selected: HoverDocEntry | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;

  for (const doc of docs) {
    const score = scoreDocForContext(doc, contextPath);
    if (score > selectedScore) {
      selected = doc;
      selectedScore = score;
    }
  }

  return selected;
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

export const resolveBirdHoverTopic = (
  lineText: string,
  character: number,
  docsSource: HoverDocsLookup,
  options?: HoverResolutionOptions,
): ResolvedHoverTopic | undefined => {
  const words = collectLineWords(lineText);
  if (words.length === 0) {
    return undefined;
  }

  const focusedWordIndex = resolveFocusedWordIndex(words, character);
  if (focusedWordIndex === -1) {
    return undefined;
  }

  const { docsByKey, keywordWordCounts } = toLookup(docsSource);

  for (const phraseLength of keywordWordCounts) {
    if (phraseLength < 1 || phraseLength > words.length) {
      continue;
    }

    const minStart = Math.max(0, focusedWordIndex - phraseLength + 1);
    const maxStart = Math.min(focusedWordIndex, words.length - phraseLength);

    for (let start = minStart; start <= maxStart; start += 1) {
      const end = start + phraseLength - 1;
      const candidate = toCandidate(words, start, end);
      if (!candidate) {
        continue;
      }

      const docs = findDocsForCandidate(docsByKey, candidate.key);
      if (!docs || docs.length === 0) {
        continue;
      }
      const doc = selectDocByContext(docs, options?.contextPath);
      if (!doc) {
        continue;
      }
      const resolvedUsage = resolveUsageForContext(doc, options?.contextPath);
      const resolvedDoc =
        resolvedUsage && resolvedUsage !== doc.usage
          ? {
              ...doc,
              usage: resolvedUsage,
            }
          : doc;

      return {
        ...candidate,
        doc: resolvedDoc,
      };
    }
  }

  return undefined;
};
