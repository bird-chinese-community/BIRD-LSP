/**
 * File role pre-classification based on content signals and path patterns.
 */

import { basename, dirname } from "node:path";
import type { ContentSignals, FileRole } from "./types.js";

/** Directory names that suggest fragment/library files */
const FRAGMENT_DIR_PATTERNS = new Set([
  "filter",
  "filters",
  "peer",
  "peers",
  "snippet",
  "snippets",
  "template",
  "templates",
  "include",
  "includes",
  "parts",
  "common",
  "shared",
]);

/** File name substrings that suggest library files */
const LIBRARY_NAME_PATTERNS = [
  "var",
  "vars",
  "filter",
  "func",
  "function",
  "macro",
  "define",
  "defines",
  "common",
  "shared",
  "helper",
];

/**
 * Classify a file's role based on its path and content signals.
 */
export const classifyFileRole = (
  relativePath: string,
  signals: ContentSignals | null,
): FileRole => {
  const fileName = basename(relativePath, ".conf");
  const dir = dirname(relativePath);
  const dirParts = dir.split("/").filter((p) => p !== ".");

  // Check path-based classification first
  const isInFragmentDir = dirParts.some((part) =>
    FRAGMENT_DIR_PATTERNS.has(part.toLowerCase()),
  );

  const fileNameLower = fileName.toLowerCase();
  const isLibraryName = LIBRARY_NAME_PATTERNS.some(
    (pattern) => fileNameLower === pattern || fileNameLower.includes(pattern),
  );

  if (!signals) {
    // No content signals — classify by path only
    if (isInFragmentDir) return "fragment";
    if (isLibraryName) return "library";
    return "unknown";
  }

  // Library: has define/global router id but no protocol block
  if (
    (signals.hasDefine || signals.hasGlobalRouterId) &&
    !signals.hasProtocolBlock
  ) {
    return "library";
  }

  // Library by name
  if (isLibraryName && !signals.hasProtocolBlock) {
    return "library";
  }

  // Fragment: has protocol but is in a fragment directory
  if (isInFragmentDir && signals.hasProtocolBlock) {
    return "fragment";
  }

  // Entry indicators: global router id OR protocol device/kernel
  if (
    signals.hasGlobalRouterId ||
    signals.hasProtocolDevice ||
    signals.hasProtocolKernel
  ) {
    return "entry";
  }

  // Has protocol blocks in root-ish path
  if (signals.hasProtocolBlock) {
    return "entry";
  }

  return "unknown";
};
