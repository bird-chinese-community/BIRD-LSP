/**
 * Include-graph supplementary analysis.
 *
 * Augments `resolveCrossFileReferences` with:
 * - Parent-directory escape detection (> 2 levels of `../`)
 * - Cycle detection via DFS
 * - Commented-include tracking
 */

import type { ContentSignals } from "./types.js";
import type { IncludeGraphExtras, DetectionWarning } from "./types.js";

/**
 * Count how many `../` segments a path traverses.
 */
const countParentEscapes = (includePath: string): number => {
  let count = 0;
  const segments = includePath.split("/");
  for (const seg of segments) {
    if (seg === "..") count++;
    else break; // stop at first non-parent segment
  }
  return count;
};

/**
 * Build an adjacency map from content signals of all scanned files.
 * Returns include edges: Map<source, target[]>
 */
export const buildIncludeEdges = (
  signalsMap: Map<string, ContentSignals>,
): Map<string, string[]> => {
  const edges = new Map<string, string[]>();
  for (const [filePath, signals] of signalsMap) {
    edges.set(filePath, [...signals.includeStatements]);
  }
  return edges;
};

/**
 * Detect cycles in the include graph using DFS.
 * Returns edges that form cycles (to be broken).
 */
export const detectCycles = (
  edges: Map<string, string[]>,
): Array<[string, string]> => {
  const cycleEdges: Array<[string, string]> = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const dfs = (node: string): void => {
    if (inStack.has(node)) return;
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);

    const neighbors = edges.get(node) ?? [];
    for (const neighbor of neighbors) {
      if (inStack.has(neighbor)) {
        cycleEdges.push([node, neighbor]);
        continue;
      }
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }

    inStack.delete(node);
  };

  for (const node of edges.keys()) {
    dfs(node);
  }

  return cycleEdges;
};

/**
 * Analyze include-graph for extras: escapes, cycles, commented includes.
 */
export const analyzeIncludeGraphExtras = (
  signalsMap: Map<string, ContentSignals>,
  maxParentEscape: number = 2,
): { extras: IncludeGraphExtras; warnings: DetectionWarning[] } => {
  const externalIncludes = new Map<string, string[]>();
  const commentedIncludes = new Map<string, string[]>();
  const warnings: DetectionWarning[] = [];

  // Collect external (escaped) includes and commented includes
  for (const [filePath, signals] of signalsMap) {
    // Check for parent escapes
    const escaped = signals.includeStatements.filter(
      (inc) => countParentEscapes(inc) > maxParentEscape,
    );
    if (escaped.length > 0) {
      externalIncludes.set(filePath, escaped);
      for (const inc of escaped) {
        warnings.push({
          code: "detection/external-include",
          message: `Include "${inc}" escapes ${countParentEscapes(inc)} parent directories (limit: ${maxParentEscape})`,
          path: filePath,
        });
      }
    }

    // Commented includes
    if (signals.commentedIncludes.length > 0) {
      commentedIncludes.set(filePath, [...signals.commentedIncludes]);
    }
  }

  // Detect cycles
  const edges = buildIncludeEdges(signalsMap);
  const cycleWarnings = detectCycles(edges);
  for (const [from, to] of cycleWarnings) {
    warnings.push({
      code: "detection/cycle",
      message: `Circular include detected: ${from} → ${to}`,
      path: from,
    });
  }

  return {
    extras: { externalIncludes, commentedIncludes, cycleWarnings },
    warnings,
  };
};
