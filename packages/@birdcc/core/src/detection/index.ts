/**
 * Smart Init Sniffing — entry-point detection for BIRD2 projects.
 *
 * Exports the single public API: `sniffProjectEntrypoints()`.
 * Used by both CLI (`birdcc init`) and LSP workspace initialization.
 */

export type {
  ContentSignals,
  DetectionKind,
  DetectionOptions,
  DetectionResult,
  DetectionWarning,
  EntryCandidate,
  FileRole,
  IncludeGraphExtras,
  SignalRecord,
} from "./types.js";

import { collectWithShallowPriority } from "./collector.js";
import { scanFileContent } from "./content-scanner.js";
import { classifyFileRole } from "./role-classifier.js";
import { scoreWithContent } from "./scorer.js";
import { analyzeIncludeGraphExtras } from "./graph-extras.js";
import {
  applyGraphStats,
  detectMonorepoMode,
  propagateScores,
} from "./topology.js";
import type {
  ContentSignals,
  DetectionOptions,
  DetectionResult,
  DetectionWarning,
  EntryCandidate,
} from "./types.js";

const AMBIGUITY_THRESHOLD = 30;

/**
 * Detect BIRD2 project entry points by scanning the file system.
 *
 * Three-phase approach:
 *   v0.1 — File-name and path heuristics
 *   v0.2 — Lightweight content scanning (first 64KB)
 *   v0.3 — Include-graph analysis and score propagation
 */
export const sniffProjectEntrypoints = async (
  root: string,
  opts?: DetectionOptions,
): Promise<DetectionResult> => {
  const warnings: DetectionWarning[] = [];
  const maxCandidates = opts?.maxCandidates ?? 100;

  // ── Phase 1: Collect candidate files ──────────────────────────────
  const collected = await collectWithShallowPriority(root, opts);
  warnings.push(...collected.warnings);

  if (collected.files.length === 0) {
    return {
      kind: "not-found",
      confidence: 100,
      primary: null,
      candidates: [],
      warnings: [
        ...warnings,
        {
          code: "detection/no-candidates",
          message: "No .conf files found in the project",
        },
      ],
    };
  }

  // Trim to maxCandidates (prefer shallow + canonical)
  const sortedFiles = [...collected.files].sort((a, b) => {
    // Canonical first
    if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
    // Then by depth (shallower first)
    return a.depth - b.depth;
  });
  const trimmedFiles = sortedFiles.slice(0, maxCandidates);

  // ── Phase 2: Content scanning + scoring ───────────────────────────
  const signalsMap = new Map<string, ContentSignals>();
  const candidates: EntryCandidate[] = [];

  // Scan files in parallel (batched to avoid too many open file handles)
  const BATCH_SIZE = 50;
  for (let i = 0; i < trimmedFiles.length; i += BATCH_SIZE) {
    const batch = trimmedFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const signals = await scanFileContent(root, file.relativePath);
        return { file, signals };
      }),
    );

    for (const { file, signals } of results) {
      if (signals) {
        signalsMap.set(file.relativePath, signals);
      }

      const role = classifyFileRole(file.relativePath, signals);
      const candidate = scoreWithContent(file, signals, role);
      candidates.push(candidate);
    }
  }

  // ── Phase 3: Include-graph analysis ───────────────────────────────
  if (signalsMap.size > 0) {
    // Graph extras: escape detection, cycle detection
    const graphAnalysis = analyzeIncludeGraphExtras(signalsMap);
    warnings.push(...graphAnalysis.warnings);

    // Filter to viable entry candidates for graph analysis
    const viableEntries = candidates
      .filter((c) => c.role !== "library" && c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // For top candidates, compute cross-file stats from their include lists
    for (const candidate of viableEntries) {
      const signals = signalsMap.get(candidate.path);
      if (signals) {
        // Count include coverage (simplified — full graph would use resolveCrossFileReferences)
        const visited = new Set<string>();
        const queue = [...signals.includeStatements];

        while (queue.length > 0) {
          const inc = queue.shift()!;
          if (visited.has(inc)) continue;
          visited.add(inc);

          const incSignals = signalsMap.get(inc);
          if (incSignals) {
            queue.push(...incSignals.includeStatements);
          }
        }

        const missingIncludes = signals.includeStatements.filter(
          (inc) => !signalsMap.has(inc),
        ).length;

        applyGraphStats(candidate, visited.size, missingIncludes, false);
      }
    }

    // Propagate scores along include edges
    propagateScores(candidates, signalsMap);
  }

  // ── Decision ──────────────────────────────────────────────────────
  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Remove library/fragment from entry competition (but keep in candidates list)
  const entryContenders = candidates.filter(
    (c) => c.role !== "library" && c.role !== "fragment",
  );

  if (entryContenders.length === 0) {
    return {
      kind: "not-found",
      confidence: 50,
      primary: candidates[0] ?? null,
      candidates,
      warnings: [
        ...warnings,
        {
          code: "detection/no-entry-candidates",
          message:
            "All candidates classified as library/fragment — no clear entry point",
        },
      ],
    };
  }

  // Check for monorepo patterns
  const monoCheck = detectMonorepoMode(entryContenders, signalsMap);
  if (
    monoCheck.kind === "monorepo-multi-entry" ||
    monoCheck.kind === "monorepo-multi-role"
  ) {
    warnings.push(...monoCheck.warnings);
    return {
      kind: monoCheck.kind,
      confidence: 70,
      primary: entryContenders[0],
      candidates,
      warnings,
    };
  }

  // Single candidate
  const top = entryContenders[0];
  const second = entryContenders[1];

  if (!second || top.score - second.score > AMBIGUITY_THRESHOLD) {
    // High confidence — clear winner
    const confidence = Math.min(100, 50 + top.score);
    return {
      kind: "single",
      confidence: Math.min(100, confidence),
      primary: top,
      candidates,
      warnings,
    };
  }

  // Ambiguous — need user confirmation
  return {
    kind: "single-ambiguous",
    confidence: Math.max(
      10,
      Math.min(60, 30 + (top.score - (second?.score ?? 0))),
    ),
    primary: top,
    candidates,
    warnings,
  };
};
