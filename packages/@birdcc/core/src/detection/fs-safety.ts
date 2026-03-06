import { normalize } from "node:path";

/**
 * Check if a path is too shallow to scan safely.
 * Only allow paths with depth >= 2 (e.g., /Users/name/project)
 * to prevent macOS TCC permission dialogs and system directory access.
 */
export const isForbiddenRoot = (path: string): boolean => {
  const normalized = normalize(path);
  // Count path segments: "/" = 0, "/Users" = 1, "/Users/name" = 2
  const segments = normalized.split("/").filter(Boolean);
  // Block / and /* level paths, only allow /*/*+
  return segments.length < 2;
};
