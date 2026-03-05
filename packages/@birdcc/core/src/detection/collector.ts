/**
 * File collector — shallow-first candidate discovery with ignore filtering.
 *
 * Scans a project root for `.conf` files using a breadth-first strategy:
 *   depth 0-2 is always scanned first for canonical names,
 *   full-tree scan only fires when shallow scan yields nothing.
 */

import { readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import type { Dirent } from "node:fs";
import type { DetectionOptions, DetectionWarning } from "./types.js";

/** Default directories to ignore during scanning */
const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "vendor",
  ".pnpm",
  "coverage",
  "__tests__",
  "test",
  "tests",
  "fixtures",
  "examples",
  "example",
  "docs",
]);

/** Canonical entry file names (highest priority) */
const CANONICAL_NAMES = new Set(["bird.conf", "bird6.conf"]);

export interface CollectedFile {
  /** Relative path from root */
  relativePath: string;
  /** Depth from root (0 = root directory) */
  depth: number;
  /** Whether this file has a canonical name */
  isCanonical: boolean;
}

export interface CollectorResult {
  files: CollectedFile[];
  warnings: DetectionWarning[];
  truncated: boolean;
}

const isIgnoredDir = (dirName: string, extraExclude: Set<string>): boolean => {
  if (dirName.startsWith(".")) return true;
  return DEFAULT_IGNORE_DIRS.has(dirName) || extraExclude.has(dirName);
};

/**
 * Collects `.conf` candidate files from the project root.
 *
 * Strategy: BFS scan with shallow-first priority.
 * - Depth 0-2 is always scanned for canonical names
 * - If nothing found, falls back to full-tree scan (bounded by maxDepth/maxFiles)
 */
export const collectCandidateFiles = async (
  root: string,
  opts?: DetectionOptions,
): Promise<CollectorResult> => {
  const maxDepth = opts?.maxDepth ?? 8;
  const maxFiles = opts?.maxFiles ?? 20_000;
  const followSymlinks = opts?.followSymlinks ?? false;
  const extraExclude = new Set(opts?.exclude ?? []);

  const files: CollectedFile[] = [];
  const warnings: DetectionWarning[] = [];
  let truncated = false;
  let fileCount = 0;

  // BFS queue: [absolutePath, depth]
  const queue: Array<[string, number]> = [[root, 0]];

  while (queue.length > 0) {
    const [currentDir, depth] = queue.shift()!;

    if (depth > maxDepth) continue;

    let entries: Dirent[];
    try {
      entries = (await readdir(currentDir, {
        withFileTypes: true,
      })) as unknown as Dirent[];
    } catch {
      // Permission denied or similar — skip silently
      continue;
    }

    for (const entry of entries) {
      if (fileCount >= maxFiles) {
        truncated = true;
        warnings.push({
          code: "detection/file-limit-reached",
          message: `Stopped scanning after ${maxFiles} files. Results may be incomplete.`,
        });
        break;
      }

      const fullPath = join(currentDir, entry.name);

      let isDir: boolean;
      let isFile: boolean;
      if (entry.isSymbolicLink() && !followSymlinks) {
        continue;
      } else if (entry.isSymbolicLink()) {
        try {
          const realStat = await stat(fullPath);
          isDir = realStat.isDirectory();
          isFile = realStat.isFile();
        } catch {
          continue;
        }
      } else {
        isDir = entry.isDirectory();
        isFile = entry.isFile();
      }

      if (isDir) {
        if (!isIgnoredDir(entry.name, extraExclude)) {
          queue.push([fullPath, depth + 1]);
        }
        continue;
      }

      if (isFile && entry.name.endsWith(".conf")) {
        fileCount++;
        const relativePath = relative(root, fullPath);
        files.push({
          relativePath,
          depth,
          isCanonical: CANONICAL_NAMES.has(basename(entry.name)),
        });
      }
    }

    if (truncated) break;
  }

  return { files, warnings, truncated };
};

/**
 * Runs shallow-first collection: first checks depth 0-2 for canonical names,
 * falls back to full scan only if needed.
 */
export const collectWithShallowPriority = async (
  root: string,
  opts?: DetectionOptions,
): Promise<CollectorResult> => {
  // First pass: shallow scan (depth 0-2)
  const shallowResult = await collectCandidateFiles(root, {
    ...opts,
    maxDepth: 2,
  });

  const canonicalShallow = shallowResult.files.filter((f) => f.isCanonical);
  if (canonicalShallow.length > 0) {
    return shallowResult;
  }

  // If shallow scan has any .conf files at all, still return them
  if (shallowResult.files.length > 0) {
    return shallowResult;
  }

  // Nothing found in shallow — do full scan
  return collectCandidateFiles(root, opts);
};
