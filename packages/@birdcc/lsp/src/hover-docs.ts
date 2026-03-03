import { readFileSync } from "node:fs";
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

const normalizeAnchor = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().replace(/^#/, "");
  return normalized.length > 0 ? normalized : undefined;
};

const loadHoverDocYaml = (): HoverDocYamlSource => {
  const hoverDocsPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "hover-docs.yaml",
  );
  const raw = readFileSync(hoverDocsPath, "utf8");
  const parsed = parse(raw) as HoverDocYamlSource;

  if (!parsed || !Array.isArray(parsed.entries) || !parsed.baseUrls) {
    throw new Error("Invalid hover docs yaml structure");
  }

  return parsed;
};

const isDiffType = (value: string): value is HoverDocDiffType =>
  value === "same" ||
  value === "added" ||
  value === "modified" ||
  value === "removed";

const isVersionTag = (value: string): value is HoverDocVersionTag =>
  value === "v2+" || value === "v3+" || value === "v2" || value === "v2-v3";

const hoverDocSource = loadHoverDocYaml();

const VERSION_BASE_URLS = {
  v2: hoverDocSource.baseUrls.v2,
  v3: hoverDocSource.baseUrls.v3,
} as const;

const toCanonicalEntry = (entry: HoverDocYamlEntry): HoverDocYamlEntry => {
  const keyword = entry.keyword.trim().toLowerCase();
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

  return {
    ...entry,
    keyword,
    anchor,
    anchors,
  };
};

const normalizedEntries = hoverDocSource.entries.map(toCanonicalEntry);

const dedupedEntries: HoverDocYamlEntry[] = [];
const seenKeywords = new Set<string>();
for (const entry of normalizedEntries) {
  if (seenKeywords.has(entry.keyword)) {
    continue;
  }

  seenKeywords.add(entry.keyword);
  dedupedEntries.push(entry);
}

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

const buildDocsSection = (entry: HoverDocYamlEntry): string => {
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

const buildNotesSection = (entry: HoverDocYamlEntry): string => {
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

const toHoverMarkdown = (entry: HoverDocYamlEntry): string => {
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
    ].join("\n") + buildNotesSection(entry)
  );
};

export const HOVER_KEYWORD_DOCS: Record<string, string> = Object.fromEntries(
  dedupedEntries.map((entry) => [entry.keyword, toHoverMarkdown(entry)]),
);

export const HOVER_KEYWORDS: readonly string[] = Object.freeze(
  dedupedEntries.map((entry) => entry.keyword),
);
