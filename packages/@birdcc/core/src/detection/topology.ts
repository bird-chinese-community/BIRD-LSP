/**
 * Topological analysis — score propagation along include edges,
 * monorepo mode detection, and final decision.
 */

import { dirname } from "node:path";
import type {
  ContentSignals,
  DetectionKind,
  DetectionWarning,
  EntryCandidate,
} from "./types.js";

const PROPAGATION_DECAY = 0.8;
const MAX_PROPAGATION_DEPTH = 3;

/**
 * Propagate positive signal scores from included files back to their includers.
 *
 * If `vars.conf` has global router-id (+50), and `bird.conf` includes `vars.conf`,
 * then `bird.conf` gets +40 (50 * 0.8). Each hop decays by 20%.
 */
export const propagateScores = (
  candidates: EntryCandidate[],
  signalsMap: Map<string, ContentSignals>,
): void => {
  // Build reverse edge map: included → includers
  const reverseEdges = new Map<string, Set<string>>();
  for (const [filePath, signals] of signalsMap) {
    for (const inc of signals.includeStatements) {
      if (!reverseEdges.has(inc)) {
        reverseEdges.set(inc, new Set());
      }
      reverseEdges.get(inc)!.add(filePath);
    }
  }

  // For each candidate, check if it's an includer of high-score files
  const candidateByPath = new Map(candidates.map((c) => [c.path, c]));

  // Walk include tree upward for each scored file
  const propagate = (
    sourcePath: string,
    sourceScore: number,
    depth: number,
    visited: Set<string>,
  ): void => {
    if (depth > MAX_PROPAGATION_DEPTH) return;
    const includers = reverseEdges.get(sourcePath);
    if (!includers) return;

    for (const includer of includers) {
      if (visited.has(includer)) continue;
      visited.add(includer);

      const propagatedScore = Math.round(
        sourceScore * PROPAGATION_DECAY ** depth,
      );
      if (propagatedScore <= 0) continue;

      const target = candidateByPath.get(includer);
      if (target) {
        target.score += propagatedScore;
        target.signals.push({
          name: `include-propagation(${sourcePath},depth:${depth})`,
          delta: propagatedScore,
        });
      }

      propagate(includer, sourceScore, depth + 1, visited);
    }
  };

  // Propagate from each candidate (especially libraries with high signals)
  for (const candidate of candidates) {
    // Only propagate positive content signals
    const contentScore = candidate.signals
      .filter(
        (s) =>
          s.delta > 0 &&
          (s.name === "global-router-id" ||
            s.name === "protocol-device" ||
            s.name === "protocol-kernel"),
      )
      .reduce((sum, s) => sum + s.delta, 0);

    if (contentScore > 0) {
      propagate(candidate.path, contentScore, 1, new Set([candidate.path]));
    }
  }
};

/**
 * Apply cross-file resolution stats to candidate scores.
 */
export const applyGraphStats = (
  candidate: EntryCandidate,
  visitedCount: number,
  missingIncludes: number,
  skippedByDepth: boolean,
): void => {
  candidate.visitedCount = visitedCount;
  candidate.missingIncludes = missingIncludes;

  // Visited count bonus (more includes = more likely entry)
  const visitBonus = Math.min(visitedCount * 2, 30);
  if (visitBonus > 0) {
    candidate.score += visitBonus;
    candidate.signals.push({
      name: `visited-count(${visitedCount})`,
      delta: visitBonus,
    });
  }

  // Missing includes penalty
  if (missingIncludes > 5) {
    candidate.score -= 10;
    candidate.signals.push({
      name: `missing-includes(${missingIncludes})`,
      delta: -10,
    });
  }

  if (skippedByDepth) {
    // No score change, but note it
    candidate.signals.push({ name: "depth-truncated", delta: 0 });
  }
};

/**
 * Determine whether a set of candidates represents a monorepo layout,
 * and if so, which kind.
 */
export const detectMonorepoMode = (
  candidates: EntryCandidate[],
  signalsMap: Map<string, ContentSignals>,
): {
  kind: DetectionKind;
  workspaces: string[];
  warnings: DetectionWarning[];
} => {
  const warnings: DetectionWarning[] = [];

  // Filter to entry-role candidates with viable scores
  const entries = candidates.filter((c) => c.role === "entry" && c.score > 0);

  if (entries.length <= 1) {
    return { kind: "single", workspaces: [], warnings };
  }

  // Group by immediate parent directory
  const dirGroups = new Map<string, EntryCandidate[]>();
  for (const entry of entries) {
    const dir = dirname(entry.path);
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, []);
    }
    dirGroups.get(dir)!.push(entry);
  }

  // Build include coverage sets per candidate
  const coverageSets = new Map<string, Set<string>>();
  for (const entry of entries) {
    const coverage = new Set<string>();
    const signals = signalsMap.get(entry.path);
    if (signals) {
      for (const inc of signals.includeStatements) {
        coverage.add(inc);
      }
    }
    coverageSets.set(entry.path, coverage);
  }

  // Check overlap between entry pairs
  const entryPaths = entries.map((e) => e.path);
  let maxOverlap = 0;

  for (let i = 0; i < entryPaths.length; i++) {
    for (let j = i + 1; j < entryPaths.length; j++) {
      const setA = coverageSets.get(entryPaths[i])!;
      const setB = coverageSets.get(entryPaths[j])!;
      const intersection = new Set([...setA].filter((x) => setB.has(x)));
      const union = new Set([...setA, ...setB]);
      const overlap = union.size > 0 ? intersection.size / union.size : 0;
      maxOverlap = Math.max(maxOverlap, overlap);
    }
  }

  // multi-entry: overlap < 30%, different directories
  if (maxOverlap < 0.3 && dirGroups.size > 1) {
    const workspaces = [...dirGroups.keys()].sort();
    return { kind: "monorepo-multi-entry", workspaces, warnings };
  }

  // multi-role: single main entry + multiple vars in different dirs
  // Check if there's one dominant entry and others are library-like
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const dominant = sorted.filter((c) => c.score >= topScore * 0.7);

  if (dominant.length === 1 && sorted.length > 1) {
    // Check if non-dominant files are variable/library files
    const others = sorted.slice(1);
    const otherDirs = new Set(others.map((o) => dirname(o.path)));
    if (otherDirs.size > 1) {
      return {
        kind: "monorepo-multi-role",
        workspaces: [...otherDirs].sort(),
        warnings,
      };
    }
  }

  // Fallback to multi-entry if multiple high-score entries exist
  if (entries.length > 1) {
    const workspaces = [...new Set(entries.map((e) => dirname(e.path)))].sort();
    return { kind: "monorepo-multi-entry", workspaces, warnings };
  }

  return { kind: "single", workspaces: [], warnings };
};
