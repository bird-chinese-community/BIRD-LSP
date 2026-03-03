import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

export type HoverDocDiffType = "same" | "added" | "modified" | "removed";
export type HoverDocVersionTag = "v2+" | "v3+" | "v2" | "v2-v3";

interface HoverDocYamlEntry {
  readonly keyword: string;
  readonly description: string;
  readonly detail: string;
  readonly diff: HoverDocDiffType;
  readonly version: HoverDocVersionTag;
  readonly usage?: string;
  readonly path?: string | readonly string[];
  readonly related?: readonly string[];
  readonly parameters?: readonly {
    readonly name: string;
    readonly description: string;
    readonly required?: boolean;
  }[];
  readonly anchor?: string;
  readonly anchors?: {
    readonly v2?: string;
    readonly v3?: string;
  };
  readonly notes?: {
    readonly v2?: string;
    readonly v3?: string;
  };
}

interface HoverDocYamlSource {
  readonly version: number;
  readonly baseUrls: {
    readonly v2: string;
    readonly v3: string;
  };
  readonly entries: readonly HoverDocYamlEntry[];
}

interface HoverDocYamlFragment {
  readonly version?: number;
  readonly baseUrls?: {
    readonly v2?: string;
    readonly v3?: string;
  };
  readonly entries?: readonly HoverDocYamlEntry[];
}

interface HoverUsageYamlEntry {
  readonly keyword: string;
  readonly usage: string;
  readonly path?: string | readonly string[];
}

interface HoverUsageYamlFragment {
  readonly version?: number;
  readonly entries?: readonly HoverUsageYamlEntry[];
}

interface HoverUsageEntry {
  readonly keyword: string;
  readonly usage: string;
  readonly normalizedPaths: readonly (readonly string[])[];
}

interface CanonicalHoverDocEntry extends HoverDocYamlEntry {
  readonly keyword: string;
  readonly usage?: string;
  readonly anchor?: string;
  readonly anchors?: {
    readonly v2?: string;
    readonly v3?: string;
  };
  readonly normalizedPaths: readonly (readonly string[])[];
  readonly usageCandidates: readonly HoverUsageEntry[];
}

export interface HoverDocResolutionOptions {
  readonly contextPath?: readonly string[];
}

const HOVER_MARKDOWN_CACHE_LIMIT = 2048;
const hoverMarkdownCache = new Map<string, string>();

const toCanonicalKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const normalizeAnchor = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/^#/, "");
  return normalized.length > 0 ? normalized : undefined;
};

const normalizePathSegments = (value: string): readonly string[] =>
  value
    .trim()
    .toLowerCase()
    .split(/[./]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const toNormalizedPaths = (
  value: string | readonly string[] | undefined,
): readonly (readonly string[])[] => {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    const normalized = normalizePathSegments(value);
    return normalized.length > 0 ? [normalized] : [];
  }

  return value
    .map((item) => normalizePathSegments(item))
    .filter((segments) => segments.length > 0);
};

const resolveDataDir = (directoryName: string): string => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(currentDir, directoryName),
    path.resolve(currentDir, "..", "data", directoryName),
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (!resolved) {
    throw new Error(`${directoryName} directory not found`);
  }

  return resolved;
};

const loadHoverDocYaml = (): HoverDocYamlSource => {
  const hoverDocsDir = resolveDataDir("hover-docs");

  const fileNames = readdirSync(hoverDocsDir)
    .filter((fileName) => fileName.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));
  if (fileNames.length === 0) {
    throw new Error("Hover docs directory is empty");
  }

  let version = 1;
  let v2BaseUrl: string | undefined;
  let v3BaseUrl: string | undefined;
  const entries: HoverDocYamlEntry[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(hoverDocsDir, fileName);
    const raw = readFileSync(filePath, "utf8");
    const parsed = parse(raw) as HoverDocYamlFragment;
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Invalid hover docs yaml fragment: ${fileName}`);
    }

    if (typeof parsed.version === "number") {
      version = parsed.version;
    }

    if (parsed.baseUrls?.v2) {
      v2BaseUrl = parsed.baseUrls.v2;
    }
    if (parsed.baseUrls?.v3) {
      v3BaseUrl = parsed.baseUrls.v3;
    }

    if (parsed.entries !== undefined && !Array.isArray(parsed.entries)) {
      throw new Error(
        `Invalid entries in hover docs yaml fragment: ${fileName}`,
      );
    }
    if (Array.isArray(parsed.entries)) {
      entries.push(...parsed.entries);
    }
  }

  if (!v2BaseUrl || !v3BaseUrl) {
    throw new Error("Missing baseUrls.v2 or baseUrls.v3 in hover docs yaml");
  }
  if (entries.length === 0) {
    throw new Error("No hover docs entries found");
  }

  return {
    version,
    baseUrls: {
      v2: v2BaseUrl,
      v3: v3BaseUrl,
    },
    entries,
  };
};

const loadHoverUsageEntries = (): readonly HoverUsageEntry[] => {
  const hoverUsageDir = resolveDataDir("hover-usage");
  const fileNames = readdirSync(hoverUsageDir)
    .filter((fileName) => fileName.endsWith(".yaml"))
    .sort((left, right) => left.localeCompare(right));
  if (fileNames.length === 0) {
    return [];
  }

  const usageEntries: HoverUsageEntry[] = [];
  for (const fileName of fileNames) {
    const filePath = path.join(hoverUsageDir, fileName);
    const raw = readFileSync(filePath, "utf8");
    const parsed = parse(raw) as HoverUsageYamlFragment;
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Invalid hover usage yaml fragment: ${fileName}`);
    }
    if (parsed.entries !== undefined && !Array.isArray(parsed.entries)) {
      throw new Error(
        `Invalid entries in hover usage yaml fragment: ${fileName}`,
      );
    }

    for (const entry of parsed.entries ?? []) {
      if (
        !entry ||
        typeof entry.keyword !== "string" ||
        typeof entry.usage !== "string"
      ) {
        throw new Error(`Invalid usage entry in fragment: ${fileName}`);
      }

      const keyword = toCanonicalKey(entry.keyword);
      const usage = entry.usage.trim();
      if (keyword.length === 0 || usage.length === 0) {
        continue;
      }

      usageEntries.push({
        keyword,
        usage,
        normalizedPaths: toNormalizedPaths(entry.path),
      });
    }
  }

  return usageEntries;
};

const isDiffType = (value: string): value is HoverDocDiffType =>
  value === "same" ||
  value === "added" ||
  value === "modified" ||
  value === "removed";

const isVersionTag = (value: string): value is HoverDocVersionTag =>
  value === "v2+" || value === "v3+" || value === "v2" || value === "v2-v3";

const isPrefixPath = (
  pathSegments: readonly string[],
  contextSegments: readonly string[],
): boolean => {
  if (
    pathSegments.length === 0 ||
    pathSegments.length > contextSegments.length
  ) {
    return false;
  }

  for (let index = 0; index < pathSegments.length; index += 1) {
    if (pathSegments[index] !== contextSegments[index]) {
      return false;
    }
  }

  return true;
};

const isSubsequencePath = (
  pathSegments: readonly string[],
  contextSegments: readonly string[],
): boolean => {
  if (
    pathSegments.length === 0 ||
    pathSegments.length > contextSegments.length
  ) {
    return false;
  }

  let contextIndex = 0;
  for (const segment of pathSegments) {
    while (
      contextIndex < contextSegments.length &&
      contextSegments[contextIndex] !== segment
    ) {
      contextIndex += 1;
    }

    if (contextIndex >= contextSegments.length) {
      return false;
    }

    contextIndex += 1;
  }

  return true;
};

const scorePathMatch = (
  normalizedPaths: readonly (readonly string[])[],
  contextPath: readonly string[] | undefined,
): number => {
  if (!contextPath || contextPath.length === 0) {
    return normalizedPaths.length === 0 ? 0 : -1;
  }

  if (normalizedPaths.length === 0) {
    return 0;
  }

  const normalizedContext = contextPath.map((segment) => segment.toLowerCase());
  let bestScore = -1;

  for (const pathSegments of normalizedPaths) {
    if (isPrefixPath(pathSegments, normalizedContext)) {
      bestScore = Math.max(bestScore, pathSegments.length * 10);
      continue;
    }

    if (isSubsequencePath(pathSegments, normalizedContext)) {
      bestScore = Math.max(bestScore, pathSegments.length * 5);
    }
  }

  return bestScore;
};

const resolveDefaultUsage = (
  entries: readonly HoverUsageEntry[],
): string | undefined => {
  if (entries.length === 0) {
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

const resolveUsageForContext = (
  entries: readonly HoverUsageEntry[],
  contextPath: readonly string[] | undefined,
): string | undefined => {
  if (entries.length === 0) {
    return undefined;
  }

  let selectedUsage: string | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const score = scorePathMatch(entry.normalizedPaths, contextPath);
    if (score > selectedScore) {
      selectedUsage = entry.usage;
      selectedScore = score;
    }
  }

  return selectedUsage ?? entries[0]?.usage;
};

const hoverDocSource = loadHoverDocYaml();
const hoverUsageEntries = loadHoverUsageEntries();

const hoverUsageByKeyword = new Map<string, HoverUsageEntry[]>();
for (const usageEntry of hoverUsageEntries) {
  const existing = hoverUsageByKeyword.get(usageEntry.keyword) ?? [];
  existing.push(usageEntry);
  hoverUsageByKeyword.set(usageEntry.keyword, existing);
}

const VERSION_BASE_URLS = {
  v2: hoverDocSource.baseUrls.v2,
  v3: hoverDocSource.baseUrls.v3,
} as const;

const toCanonicalEntry = (entry: HoverDocYamlEntry): CanonicalHoverDocEntry => {
  const keyword = toCanonicalKey(entry.keyword);
  if (keyword.length === 0) {
    throw new Error("Hover keyword must not be empty");
  }

  if (!isDiffType(entry.diff)) {
    throw new Error(`Invalid diff type for keyword '${keyword}'`);
  }

  if (!isVersionTag(entry.version)) {
    throw new Error(`Invalid version tag for keyword '${keyword}'`);
  }

  const anchor = normalizeAnchor(entry.anchor);
  const anchors = entry.anchors
    ? {
        ...(normalizeAnchor(entry.anchors.v2)
          ? { v2: normalizeAnchor(entry.anchors.v2) }
          : {}),
        ...(normalizeAnchor(entry.anchors.v3)
          ? { v3: normalizeAnchor(entry.anchors.v3) }
          : {}),
      }
    : undefined;

  if (
    (entry.version === "v2+" ||
      entry.version === "v3+" ||
      entry.version === "v2") &&
    !anchor
  ) {
    throw new Error(
      `Keyword '${keyword}' requires a single anchor for version '${entry.version}'`,
    );
  }

  if (
    entry.version === "v2-v3" &&
    !anchor &&
    (!anchors || Object.keys(anchors).length === 0)
  ) {
    throw new Error(
      `Keyword '${keyword}' requires anchor or anchors for version 'v2-v3'`,
    );
  }

  const usageCandidates = hoverUsageByKeyword.get(keyword) ?? [];

  return {
    ...entry,
    keyword,
    usage: entry.usage ?? resolveDefaultUsage(usageCandidates),
    anchor,
    anchors,
    normalizedPaths: toNormalizedPaths(entry.path),
    usageCandidates,
  };
};

const normalizedEntries = hoverDocSource.entries.map(toCanonicalEntry);

const entriesByKeyword = new Map<string, CanonicalHoverDocEntry[]>();
for (const entry of normalizedEntries) {
  const existing = entriesByKeyword.get(entry.keyword) ?? [];
  existing.push(entry);
  entriesByKeyword.set(entry.keyword, existing);
}

const selectEntryForContext = (
  entries: readonly CanonicalHoverDocEntry[],
  contextPath: readonly string[] | undefined,
): CanonicalHoverDocEntry | undefined => {
  let selected: CanonicalHoverDocEntry | undefined;
  let selectedScore = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const score = scorePathMatch(entry.normalizedPaths, contextPath);
    if (score > selectedScore) {
      selected = entry;
      selectedScore = score;
    }
  }

  return selected;
};

const buildDocUrl = (
  version: keyof typeof VERSION_BASE_URLS,
  anchor?: string,
): string => {
  const baseUrl = VERSION_BASE_URLS[version];
  if (!anchor || anchor.length === 0) {
    return baseUrl;
  }

  return `${baseUrl}#${anchor}`;
};

const buildDocsSection = (entry: CanonicalHoverDocEntry): string => {
  const lines: string[] = [];

  if (entry.version === "v2+") {
    lines.push(`- [BIRD v2.18 / v3.2.0](${buildDocUrl("v2", entry.anchor)})`);
  } else if (entry.version === "v3+") {
    lines.push(`- [BIRD v3.2.0](${buildDocUrl("v3", entry.anchor)})`);
  } else if (entry.version === "v2") {
    lines.push(`- [BIRD v2.18](${buildDocUrl("v2", entry.anchor)})`);
  } else {
    const v2Anchor = entry.anchors?.v2 ?? entry.anchor;
    const v3Anchor = entry.anchors?.v3 ?? entry.anchor;

    if (v2Anchor) {
      lines.push(`- [BIRD v2.18](${buildDocUrl("v2", v2Anchor)})`);
    }

    if (v3Anchor) {
      lines.push(`- [BIRD v3.2.0](${buildDocUrl("v3", v3Anchor)})`);
    }
  }

  return lines.join("\n");
};

const buildNotesSection = (entry: CanonicalHoverDocEntry): string => {
  if (!entry.notes) {
    return "";
  }

  const lines: string[] = [];
  if (entry.notes.v2) {
    lines.push(`- v2: ${entry.notes.v2}`);
  }

  if (entry.notes.v3) {
    lines.push(`- v3: ${entry.notes.v3}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `\n\nNotes:\n${lines.join("\n")}`;
};

const buildContextSection = (entry: CanonicalHoverDocEntry): string => {
  if (!entry.path) {
    return "";
  }

  const paths = Array.isArray(entry.path) ? entry.path : [entry.path];
  if (paths.length === 0) {
    return "";
  }

  return `\n\nContext:\n${paths.map((item) => `- \`${item}\``).join("\n")}`;
};

const buildRelatedSection = (entry: CanonicalHoverDocEntry): string => {
  if (!entry.related || entry.related.length === 0) {
    return "";
  }

  return `\n\nRelated:\n${entry.related.map((item) => `- \`${item}\``).join("\n")}`;
};

const buildParametersSection = (entry: CanonicalHoverDocEntry): string => {
  if (!entry.parameters || entry.parameters.length === 0) {
    return "";
  }

  const lines = entry.parameters.map((parameter) => {
    const requiredLabel = parameter.required ? " (required)" : "";
    return `- \`${parameter.name}\`${requiredLabel}: ${parameter.description}`;
  });
  return `\n\nParameters:\n${lines.join("\n")}`;
};

const toHoverMarkdown = (
  entry: CanonicalHoverDocEntry,
  usage: string | undefined,
): string => {
  const usageSection = usage ? `\n\nUsage:\n\`\`\`bird\n${usage}\n\`\`\`` : "";
  return (
    [
      `### ${entry.description}`,
      "",
      entry.detail,
      "",
      `Diff: \`${entry.diff}\``,
      `Version: \`${entry.version}\``,
      "Docs:",
      buildDocsSection(entry),
    ].join("\n") +
    usageSection +
    buildContextSection(entry) +
    buildParametersSection(entry) +
    buildRelatedSection(entry) +
    buildNotesSection(entry)
  );
};

const toContextCacheKey = (
  contextPath: readonly string[] | undefined,
): string =>
  contextPath && contextPath.length > 0
    ? contextPath.map((segment) => segment.toLowerCase()).join(".")
    : "";

const setCachedMarkdown = (cacheKey: string, markdown: string): void => {
  if (hoverMarkdownCache.has(cacheKey)) {
    hoverMarkdownCache.delete(cacheKey);
  }
  hoverMarkdownCache.set(cacheKey, markdown);

  if (hoverMarkdownCache.size > HOVER_MARKDOWN_CACHE_LIMIT) {
    const oldestKey = hoverMarkdownCache.keys().next().value;
    if (oldestKey) {
      hoverMarkdownCache.delete(oldestKey);
    }
  }
};

export const resolveHoverKeywordDoc = (
  keyword: string,
  options?: HoverDocResolutionOptions,
): string | undefined => {
  const canonicalKey = toCanonicalKey(keyword);
  if (canonicalKey.length === 0) {
    return undefined;
  }

  const contextCacheKey = toContextCacheKey(options?.contextPath);
  const cacheKey = `${canonicalKey}::${contextCacheKey}`;
  const cachedMarkdown = hoverMarkdownCache.get(cacheKey);
  if (cachedMarkdown !== undefined) {
    return cachedMarkdown;
  }

  const entries = entriesByKeyword.get(canonicalKey);
  if (!entries || entries.length === 0) {
    return undefined;
  }

  const entry = selectEntryForContext(entries, options?.contextPath);
  if (!entry) {
    return undefined;
  }

  const usage =
    resolveUsageForContext(entry.usageCandidates, options?.contextPath) ??
    entry.usage;
  const markdown = toHoverMarkdown(entry, usage);
  setCachedMarkdown(cacheKey, markdown);

  return markdown;
};

export const HOVER_KEYWORDS: readonly string[] = Object.freeze([
  ...entriesByKeyword.keys(),
]);

export const HOVER_KEYWORD_DOCS: Record<string, string> = Object.fromEntries(
  HOVER_KEYWORDS.flatMap((keyword) => {
    const markdown = resolveHoverKeywordDoc(keyword);
    if (!markdown) {
      return [];
    }

    return [[keyword, markdown]];
  }),
);
