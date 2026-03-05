/**
 * Multi-signal weighted scorer for entry-point candidates.
 *
 * Each signal contributes a positive or negative delta, recorded
 * in SignalRecord for explainability.
 */

import { basename, dirname } from "node:path";
import type {
  ContentSignals,
  EntryCandidate,
  FileRole,
  SignalRecord,
} from "./types.js";
import type { CollectedFile } from "./collector.js";

/** Directories on the default ignore list that cause a score penalty */
const IGNORED_DIR_PENALTY_PATTERNS = new Set([
  "examples",
  "example",
  "test",
  "tests",
  "fixtures",
  "docs",
]);

/** Directories suggesting fragment files */
const FRAGMENT_DIR_PENALTY_PATTERNS = new Set([
  "filter",
  "filters",
  "peer",
  "peers",
  "snippet",
  "snippets",
  "template",
  "templates",
]);

/** File name substrings suggesting library files */
const LIBRARY_NAME_PENALTY = ["var", "filter", "func", "macro"];

/**
 * Compute a score for a candidate based on file-name and path signals only (v0.1 level).
 */
export const scoreByPathOnly = (file: CollectedFile): EntryCandidate => {
  const signals: SignalRecord[] = [];
  let score = 0;

  // Canonical name bonus
  if (file.isCanonical) {
    score += 25;
    signals.push({ name: "canonical-name", delta: 25 });
  }

  // Root-level bonus
  if (file.depth === 0) {
    score += 10;
    signals.push({ name: "root-level", delta: 10 });
  }

  // Penalize ignored directories in the path
  const dirParts = dirname(file.relativePath)
    .split("/")
    .filter((p) => p !== ".");
  for (const part of dirParts) {
    if (IGNORED_DIR_PENALTY_PATTERNS.has(part.toLowerCase())) {
      score -= 20;
      signals.push({ name: `ignored-dir-penalty(${part})`, delta: -20 });
    }
  }

  return {
    path: file.relativePath,
    score,
    signals,
    role: "unknown",
    visitedCount: 0,
    missingIncludes: 0,
  };
};

/**
 * Compute a full score for a candidate using content signals (v0.2 level).
 */
export const scoreWithContent = (
  file: CollectedFile,
  contentSignals: ContentSignals | null,
  role: FileRole,
): EntryCandidate => {
  // Start from path-only score
  const base = scoreByPathOnly(file);

  if (!contentSignals) {
    return { ...base, role };
  }

  const signals = [...base.signals];
  let score = base.score;

  // Global router id — strongest content signal
  if (contentSignals.hasGlobalRouterId) {
    score += 50;
    signals.push({ name: "global-router-id", delta: 50 });
  }

  // Protocol-level router id only — weaker signal
  if (contentSignals.hasProtocolRouterIdOnly) {
    score += 10;
    signals.push({ name: "protocol-router-id", delta: 10 });
  }

  // Protocol device / kernel — strong entry indicators
  if (contentSignals.hasProtocolDevice) {
    score += 20;
    signals.push({ name: "protocol-device", delta: 20 });
  }
  if (contentSignals.hasProtocolKernel) {
    score += 20;
    signals.push({ name: "protocol-kernel", delta: 20 });
  }

  // Log directive
  if (contentSignals.hasLogDirective) {
    score += 10;
    signals.push({ name: "log-directive", delta: 10 });
  }

  // Fragment directory penalty
  const dirParts = dirname(file.relativePath)
    .split("/")
    .filter((p) => p !== ".");
  for (const part of dirParts) {
    if (FRAGMENT_DIR_PENALTY_PATTERNS.has(part.toLowerCase())) {
      score -= 20;
      signals.push({ name: `fragment-dir-penalty(${part})`, delta: -20 });
    }
  }

  // Library file name penalty
  const fileNameLower = basename(file.relativePath, ".conf").toLowerCase();
  for (const pattern of LIBRARY_NAME_PENALTY) {
    if (fileNameLower.includes(pattern)) {
      score -= 20;
      signals.push({ name: `library-name-penalty(${pattern})`, delta: -20 });
      break; // only one penalty per file
    }
  }

  // Define-only penalty (has define but no protocol)
  if (contentSignals.hasDefine && !contentSignals.hasProtocolBlock) {
    score -= 15;
    signals.push({ name: "define-only-no-protocol", delta: -15 });
  }

  // Include count bonus — more includes means more likely an entry
  const includeCount = contentSignals.includeStatements.length;
  if (includeCount > 0) {
    const bonus = Math.min(includeCount * 2, 20);
    score += bonus;
    signals.push({ name: `include-count(${includeCount})`, delta: bonus });
  }

  return {
    path: file.relativePath,
    score,
    signals,
    role,
    visitedCount: 0,
    missingIncludes: 0,
  };
};
