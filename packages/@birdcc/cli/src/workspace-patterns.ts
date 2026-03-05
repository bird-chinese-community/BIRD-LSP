import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const DEFAULT_WORKSPACE_ENTRY_FILE = "bird.conf";
const IGNORED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "coverage",
  ".turbo",
  ".pnpm",
]);

const normalizePosixPath = (value: string): string => {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized.length === 0) {
    return ".";
  }
  return normalized.replace(/^\.\//, "");
};

const globToRegExp = (pattern: string): RegExp => {
  const normalized = normalizePosixPath(pattern);
  if (normalized.length === 0) {
    return /^$/;
  }

  let output = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === "*" && nextChar === "*") {
      output += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      output += "[^/]*";
      continue;
    }
    if (char === "?") {
      output += "[^/]";
      continue;
    }

    output += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  return new RegExp(`^${output}$`);
};

const matchesWorkspacePatterns = (
  relativeDir: string,
  patterns: readonly string[],
): boolean => {
  const candidate = normalizePosixPath(relativeDir);
  let included = false;

  for (const rawPattern of patterns) {
    const trimmed = rawPattern.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const isNegated = trimmed.startsWith("!");
    const pattern = isNegated ? trimmed.slice(1) : trimmed;
    if (pattern.length === 0) {
      continue;
    }

    if (!globToRegExp(pattern).test(candidate)) {
      continue;
    }

    included = !isNegated;
  }

  return included;
};

const listWorkspaceCandidateDirectories = async (
  configDir: string,
): Promise<string[]> => {
  const queue: string[] = [resolve(configDir)];
  const candidates: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    let hasEntryFile = false;
    for (const entry of entries) {
      if (entry.isFile() && entry.name === DEFAULT_WORKSPACE_ENTRY_FILE) {
        hasEntryFile = true;
        break;
      }
    }

    if (hasEntryFile) {
      candidates.push(current);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (
        entry.name.startsWith(".") ||
        IGNORED_DIR_NAMES.has(entry.name.toLowerCase())
      ) {
        continue;
      }
      queue.push(join(current, entry.name));
    }
  }

  return candidates;
};

/**
 * Resolve `workspaces` globs from bird.config.json to concrete entry file paths.
 * Supports ordered include/exclude patterns, e.g. ["sites/*", "!sites/legacy"].
 */
export const resolveWorkspaceEntries = async (
  configDir: string,
  patterns: string[],
): Promise<string[]> => {
  if (patterns.length === 0) {
    return [];
  }

  const candidateDirs = await listWorkspaceCandidateDirectories(configDir);
  const matchedEntries = candidateDirs
    .filter((dirPath) =>
      matchesWorkspacePatterns(relative(configDir, dirPath), patterns),
    )
    .map((dirPath) => join(dirPath, DEFAULT_WORKSPACE_ENTRY_FILE))
    .sort((left, right) => left.localeCompare(right));

  const deduped: string[] = [];
  let previous: string | undefined;
  for (const entry of matchedEntries) {
    if (entry === previous) {
      continue;
    }
    deduped.push(entry);
    previous = entry;
  }

  return deduped;
};
