import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

const sourcePath = path.join(packageRoot, "src", "hover-docs.yaml");
const targetPath = path.join(packageRoot, "src", "hover-docs.ts");

const rawYaml = await readFile(sourcePath, "utf8");
const source = parse(rawYaml);

const assertString = (value, message) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
};

const assertDiff = (value, keyword) => {
  if (
    value !== "same" &&
    value !== "added" &&
    value !== "modified" &&
    value !== "removed"
  ) {
    throw new Error(`Invalid diff for keyword '${keyword}'`);
  }
  return value;
};

const assertVersion = (value, keyword) => {
  if (
    value !== "v2+" &&
    value !== "v3+" &&
    value !== "v2" &&
    value !== "v2-v3"
  ) {
    throw new Error(`Invalid version tag for keyword '${keyword}'`);
  }
  return value;
};

const normalizeAnchor = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/^#/, "");
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeNotes = (value) => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const v2 = typeof value.v2 === "string" ? value.v2.trim() : "";
  const v3 = typeof value.v3 === "string" ? value.v3.trim() : "";
  if (!v2 && !v3) {
    return undefined;
  }
  return {
    ...(v2 ? { v2 } : {}),
    ...(v3 ? { v3 } : {}),
  };
};

const normalizeAnchors = (value) => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const v2 = normalizeAnchor(value.v2);
  const v3 = normalizeAnchor(value.v3);
  if (!v2 && !v3) {
    return undefined;
  }
  return {
    ...(v2 ? { v2 } : {}),
    ...(v3 ? { v3 } : {}),
  };
};

const baseUrls = {
  v2: assertString(source?.baseUrls?.v2, "Missing baseUrls.v2"),
  v3: assertString(source?.baseUrls?.v3, "Missing baseUrls.v3"),
};

if (!Array.isArray(source?.entries)) {
  throw new Error("Missing entries array in hover-docs.yaml");
}

const normalizedEntries = source.entries
  .map((entry) => {
    const keyword = assertString(
      entry?.keyword,
      "Entry keyword is required",
    ).toLowerCase();
    const description = assertString(
      entry?.description,
      `Missing description for keyword '${keyword}'`,
    );
    const detail = assertString(
      entry?.detail,
      `Missing detail for keyword '${keyword}'`,
    );
    const diff = assertDiff(entry?.diff, keyword);
    const version = assertVersion(entry?.version, keyword);
    const anchor = normalizeAnchor(entry?.anchor);
    const anchors = normalizeAnchors(entry?.anchors);
    const notes = normalizeNotes(entry?.notes);

    if (
      (version === "v2+" || version === "v3+" || version === "v2") &&
      !anchor
    ) {
      throw new Error(
        `Keyword '${keyword}' requires 'anchor' for version '${version}'`,
      );
    }

    if (version === "v2-v3" && !anchor && !anchors) {
      throw new Error(
        `Keyword '${keyword}' requires 'anchor' or 'anchors' for version 'v2-v3'`,
      );
    }

    return {
      keyword,
      description,
      detail,
      diff,
      version,
      ...(anchor ? { anchor } : {}),
      ...(anchors ? { anchors } : {}),
      ...(notes ? { notes } : {}),
    };
  })
  .sort((left, right) => left.keyword.localeCompare(right.keyword));

const dedupedEntries = [];
const seenKeywords = new Set();
for (const entry of normalizedEntries) {
  if (seenKeywords.has(entry.keyword)) {
    console.warn(
      `[hover-docs:generate] skip duplicate keyword '${entry.keyword}'`,
    );
    continue;
  }
  seenKeywords.add(entry.keyword);
  dedupedEntries.push(entry);
}

const header = `/* eslint-disable */
/**
 * This file is generated from src/hover-docs.yaml.
 * Run: pnpm --filter @birdcc/lsp hover-docs:generate
 */
`;

const tsBody = `export type HoverDocDiffType = "same" | "added" | "modified" | "removed";
export type HoverDocVersionTag = "v2+" | "v3+" | "v2" | "v2-v3";

export interface HoverDocSourceEntry {
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

const VERSION_BASE_URLS = ${JSON.stringify(baseUrls, null, 2)} as const;

const HOVER_DOC_SOURCES = ${JSON.stringify(dedupedEntries, null, 2)} as const satisfies readonly HoverDocSourceEntry[];

const buildDocUrl = (version: keyof typeof VERSION_BASE_URLS, anchor?: string): string => {
  const baseUrl = VERSION_BASE_URLS[version];
  if (!anchor || anchor.length === 0) {
    return baseUrl;
  }
  return \`${"${baseUrl}"}#${"${anchor}"}\`;
};

const buildDocsSection = (entry: HoverDocSourceEntry): string => {
  const lines: string[] = [];

  if (entry.version === "v2+") {
    lines.push(\`- [BIRD v2.18 / v3.2.0](${'${buildDocUrl("v2", entry.anchor)}'})\`);
  } else if (entry.version === "v3+") {
    lines.push(\`- [BIRD v3.2.0](${'${buildDocUrl("v3", entry.anchor)}'})\`);
  } else if (entry.version === "v2") {
    lines.push(\`- [BIRD v2.18](${'${buildDocUrl("v2", entry.anchor)}'})\`);
  } else {
    const v2Anchor = entry.anchors?.v2 ?? entry.anchor;
    const v3Anchor = entry.anchors?.v3 ?? entry.anchor;

    if (v2Anchor) {
      lines.push(\`- [BIRD v2.18](${'${buildDocUrl("v2", v2Anchor)}'})\`);
    }

    if (v3Anchor) {
      lines.push(\`- [BIRD v3.2.0](${'${buildDocUrl("v3", v3Anchor)}'})\`);
    }
  }

  return lines.join("\\n");
};

const buildNotesSection = (entry: HoverDocSourceEntry): string => {
  if (!entry.notes) {
    return "";
  }

  const lines: string[] = [];
  if (entry.notes.v2) {
    lines.push(\`- v2: ${"${entry.notes.v2}"}\`);
  }
  if (entry.notes.v3) {
    lines.push(\`- v3: ${"${entry.notes.v3}"}\`);
  }

  if (lines.length === 0) {
    return "";
  }

  return \`\\n\\nNotes:\\n${'${lines.join("\\n")}'}\`;
};

const toHoverMarkdown = (entry: HoverDocSourceEntry): string =>
  [
    \`### ${"${entry.description}"}\`,
    "",
    entry.detail,
    "",
    \`Diff: \\\`${"${entry.diff}"}\\\`\`,
    \`Version: \\\`${"${entry.version}"}\\\`\`,
    "Docs:",
    buildDocsSection(entry),
  ].join("\\n") + buildNotesSection(entry);

export const HOVER_KEYWORD_DOCS: Record<string, string> = Object.fromEntries(
  HOVER_DOC_SOURCES.map((entry) => [entry.keyword, toHoverMarkdown(entry)]),
);

export const HOVER_KEYWORDS: readonly string[] = Object.freeze(
  HOVER_DOC_SOURCES.map((entry) => entry.keyword),
);
`;

await writeFile(targetPath, `${header}${tsBody}`, "utf8");
