/**
 * File collector — shallow-first candidate discovery with ignore filtering.
 *
 * Scans a project root for `.conf` files using a breadth-first strategy:
 *   depth 0-2 is always scanned first for canonical names,
 *   full-tree scan only fires when shallow scan yields nothing.
 */

import { opendir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import type { DetectionOptions, DetectionWarning } from "./types.js";
import { isForbiddenRoot } from "./fs-safety.js";

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
const CANONICAL_NAMES = new Set([
  ".bird2.conf",
  ".bird3.conf",
  "bird.conf",
  "bird2.conf",
  "bird3.conf",
  "bird6.conf",
]);

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
  // Safety check: prevent scanning forbidden system directories
  if (isForbiddenRoot(root)) {
    return {
      files: [],
      warnings: [
        {
          code: "detection/forbidden-root",
          message: `Refused to scan forbidden root directory: ${root}`,
        },
      ],
      truncated: false,
    };
  }

  const maxDepth = opts?.maxDepth ?? 8;
  const maxFiles = opts?.maxFiles ?? 20_000;
  const maxEntries = opts?.maxEntries ?? 20_000;
  const maxDirectories = opts?.maxDirectories ?? 2_048;
  const followSymlinks = opts?.followSymlinks ?? false;
  const extraExclude = new Set(opts?.exclude ?? []);

  const files: CollectedFile[] = [];
  const warnings: DetectionWarning[] = [];
  let truncated = false;
  let fileCount = 0;
  let entryCount = 0;
  let directoryCount = 0;

  // BFS queue: [absolutePath, depth]
  const queue: Array<[string, number]> = [[root, 0]];

  while (queue.length > 0) {
    const [currentDir, depth] = queue.shift()!;

    if (depth > maxDepth) continue;

    if (directoryCount >= maxDirectories) {
      truncated = true;
      warnings.push({
        code: "detection/directory-limit-reached",
        message: `Stopped scanning after ${maxDirectories} directories. Results may be incomplete.`,
      });
      break;
    }
    directoryCount += 1;
    let directory;
    try {
      directory = await opendir(currentDir);
    } catch {
      // Permission denied or similar — skip silently
      continue;
    }

    for await (const entry of directory) {
      if (entryCount >= maxEntries) {
        truncated = true;
        warnings.push({
          code: "detection/entry-limit-reached",
          message: `Stopped scanning after ${maxEntries} directory entries. Results may be incomplete.`,
        });
        break;
      }
      entryCount += 1;
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
          if (queue.length + directoryCount >= maxDirectories) {
            truncated = true;
            warnings.push({
              code: "detection/directory-limit-reached",
              message: `Stopped scanning after scheduling ${maxDirectories} directories. Results may be incomplete.`,
            });
            break;
          }
          queue.push([fullPath, depth + 1]);
        }
        continue;
      }

      if (isFile && entry.name.endsWith(".conf")) {
        fileCount++;
        const relativePath = relative(root, fullPath).replaceAll("\\", "/");
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
 * Collect all bounded candidates. Ranking applies shallow/canonical priority
 * after collection so a shallow entry cannot hide deeper monorepo instances.
 */
export const collectWithShallowPriority = async (
  root: string,
  opts?: DetectionOptions,
): Promise<CollectorResult> => collectCandidateFiles(root, opts);
