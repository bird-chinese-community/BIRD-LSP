/**
 * Smart Init Sniffing — entry-point detection for BIRD2 projects.
 *
 * Exports the single public API: `sniffProjectEntrypoints()`.
 * Used by both CLI (`birdcc init`) and LSP workspace initialization.
 */

export type {
  ContentSignals,
  BirdDeclarationEvidence,
  BirdDocumentEligibility,
  BirdDocumentEligibilityOptions,
  BirdDocumentEligibilityReason,
  DetectionKind,
  DetectionOptions,
  DetectionResult,
  DetectionWarning,
  EntryCandidate,
  FileRole,
  IncludeGraphExtras,
  SignalRecord,
} from "./types.js";

export {
  collectBirdDeclarationEvidence,
  evaluateBirdDocumentEligibility,
  evaluateParsedBirdDocumentEligibility,
  isCanonicalBirdConfigPath,
} from "./eligibility.js";

import { collectWithShallowPriority } from "./collector.js";
import { analyzeFileContent } from "./content-scanner.js";
import { classifyFileRole } from "./role-classifier.js";
import { scoreWithContent } from "./scorer.js";
import { analyzeIncludeGraphExtras } from "./graph-extras.js";
import {
  collectReachableIncludes,
  resolveIncludeGraph,
} from "./include-graph.js";
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
const AUTO_SELECTION_CONFIDENCE = 70;

const compareCandidates = (a: EntryCandidate, b: EntryCandidate): number =>
  b.score - a.score || a.path.localeCompare(b.path);

const normalizeRelativePath = (path: string): string =>
  path.replaceAll("\\", "/").replace(/^\.\//, "");

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
    const explicitMain = opts?.explicitMain
      ? normalizeRelativePath(opts.explicitMain)
      : undefined;
    const aIsExplicit = explicitMain === a.relativePath;
    const bIsExplicit = explicitMain === b.relativePath;
    if (aIsExplicit !== bIsExplicit) return aIsExplicit ? -1 : 1;
    // Canonical first
    if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
    // Then by depth (shallower first)
    return a.depth - b.depth || a.relativePath.localeCompare(b.relativePath);
  });
  const trimmedFiles = sortedFiles.slice(0, maxCandidates);
  if (collected.files.length > maxCandidates) {
    warnings.push({
      code: "detection/candidate-limit-reached",
      message: `Only the first ${maxCandidates} of ${collected.files.length} configuration candidates were analyzed.`,
    });
  }

  // ── Phase 2: Content scanning + scoring ───────────────────────────
  const signalsMap = new Map<string, ContentSignals>();
  const candidates: EntryCandidate[] = [];

  // Scan files in parallel (batched to avoid too many open file handles)
  const BATCH_SIZE = 50;
  for (let i = 0; i < trimmedFiles.length; i += BATCH_SIZE) {
    const batch = trimmedFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const analysis = await analyzeFileContent(
          root,
          file.relativePath,
          opts?.explicitMain !== undefined &&
            normalizeRelativePath(opts.explicitMain) ===
              normalizeRelativePath(file.relativePath),
        );
        return { file, analysis };
      }),
    );

    for (const { file, analysis } of results) {
      const signals = analysis?.signals ?? null;
      if (analysis) {
        signalsMap.set(
          normalizeRelativePath(file.relativePath),
          analysis.signals,
        );
      }

      let role = classifyFileRole(file.relativePath, signals);
      const declarationKinds = analysis?.eligibility.declarationKinds ?? [];
      if (
        role === "unknown" &&
        declarationKinds.length > 0 &&
        declarationKinds.every((kind) =>
          ["define", "filter", "function", "table", "template"].includes(kind),
        )
      ) {
        role = "library";
      }
      const candidate = scoreWithContent(file, signals, role);
      candidate.qualified = analysis?.eligibility.eligible ?? false;
      candidate.declarationKinds = declarationKinds;
      candidate.includedByCount = 0;

      if (analysis?.eligibility.eligible) {
        const delta = file.isCanonical ? 0 : 15;
        candidate.score += delta;
        candidate.signals.push({
          name: `bird-eligibility(${analysis.eligibility.reason})`,
          delta,
        });
      } else {
        candidate.role = "external";
        candidate.signals.push({
          name: "rejected-no-bird-evidence",
          delta: 0,
        });
      }
      candidates.push(candidate);
    }
  }

  // ── Phase 3: Include-graph analysis ───────────────────────────────
  const includeGraph = resolveIncludeGraph(root, signalsMap);
  if (signalsMap.size > 0) {
    // Graph extras: escape detection, cycle detection
    const graphAnalysis = analyzeIncludeGraphExtras(
      signalsMap,
      2,
      includeGraph.edges,
    );
    warnings.push(...graphAnalysis.warnings);

    for (const candidate of candidates) {
      candidate.includedByCount =
        includeGraph.includedByCount.get(candidate.path) ?? 0;
    }

    // Filter to viable entry candidates for graph analysis
    const viableEntries = candidates
      .filter((c) => c.qualified && c.role !== "library" && c.score > 0)
      .sort(compareCandidates)
      .slice(0, 5);

    // For top candidates, compute cross-file stats from their include lists
    for (const candidate of viableEntries) {
      const visited = collectReachableIncludes(
        candidate.path,
        includeGraph.edges,
      );
      const missingIncludes = [candidate.path, ...visited].reduce(
        (count, path) => count + (includeGraph.missingBySource.get(path) ?? 0),
        0,
      );

      applyGraphStats(candidate, visited.size, missingIncludes, false);
    }

    // Propagate scores along include edges
    propagateScores(candidates, includeGraph.edges);
  }

  // ── Decision ──────────────────────────────────────────────────────
  // Sort by score descending
  candidates.sort(compareCandidates);

  const qualifiedCandidates = candidates.filter((candidate) =>
    Boolean(candidate.qualified),
  );
  if (qualifiedCandidates.length === 0) {
    return {
      kind: "not-found",
      confidence: 100,
      primary: null,
      candidates,
      warnings: [
        ...warnings,
        {
          code: "detection/no-bird-evidence",
          message:
            "Configuration files were found, but none contained parsed BIRD declarations.",
        },
      ],
    };
  }

  // Remove library/fragment from entry competition (but keep in candidates list)
  const entryContenders = candidates.filter(
    (c) =>
      c.qualified &&
      (c.includedByCount ?? 0) === 0 &&
      (c.signals.some(
        (signal) =>
          signal.name === "canonical-name" ||
          signal.name === "bird-eligibility(explicit-main)",
      ) ||
        (c.role !== "library" && c.role !== "fragment")),
  );

  if (entryContenders.length === 0) {
    return {
      kind: "not-found",
      confidence: 50,
      primary: null,
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
  const monoCheck = detectMonorepoMode(
    entryContenders,
    includeGraph.edges,
    qualifiedCandidates,
  );
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

/**
 * Return an entry only when a detection result is safe for unattended use.
 */
export const selectAutoDetectedEntry = (
  result: DetectionResult,
): EntryCandidate | null => {
  if (
    result.kind === "single" &&
    result.confidence >= AUTO_SELECTION_CONFIDENCE
  ) {
    return result.primary;
  }

  if (result.kind === "monorepo-multi-role") {
    return result.primary;
  }

  return null;
};
