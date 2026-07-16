import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ContentSignals } from "./types.js";

export interface ResolvedIncludeGraph {
  edges: Map<string, string[]>;
  missingBySource: Map<string, number>;
  includedByCount: Map<string, number>;
}

const normalizeRelativePath = (path: string): string =>
  path.replaceAll("\\", "/").replace(/^\.\//, "");

const isWithinRoot = (relativePath: string): boolean =>
  relativePath.length > 0 &&
  !relativePath.startsWith("../") &&
  !isAbsolute(relativePath);

const globToRegExp = (glob: string): RegExp => {
  let output = "";
  for (const character of glob) {
    if (character === "*") {
      output += "[^/]*";
    } else if (character === "?") {
      output += "[^/]";
    } else {
      output += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${output}$`);
};

export const resolveIncludeGraph = (
  root: string,
  signalsMap: Map<string, ContentSignals>,
): ResolvedIncludeGraph => {
  const knownPaths = [...signalsMap.keys()].map(normalizeRelativePath).sort();
  const knownPathSet = new Set(knownPaths);
  const edges = new Map<string, string[]>();
  const missingBySource = new Map<string, number>();
  const includedByCount = new Map<string, number>();

  for (const [rawSource, signals] of signalsMap) {
    const source = normalizeRelativePath(rawSource);
    const targets = new Set<string>();
    let missing = 0;

    for (const includePath of signals.includeStatements) {
      const absolutePattern = resolve(root, dirname(source), includePath);
      const relativePattern = normalizeRelativePath(
        relative(root, absolutePattern),
      );
      if (!isWithinRoot(relativePattern)) {
        missing += 1;
        continue;
      }

      let matches: string[];
      if (/[*?]/.test(relativePattern)) {
        const pattern = globToRegExp(relativePattern);
        matches = knownPaths.filter((path) => pattern.test(path));
      } else {
        matches = knownPathSet.has(relativePattern) ? [relativePattern] : [];
      }

      if (matches.length === 0) {
        missing += 1;
        continue;
      }

      for (const match of matches) {
        targets.add(match);
      }
    }

    const sortedTargets = [...targets].sort();
    edges.set(source, sortedTargets);
    missingBySource.set(source, missing);
    for (const target of sortedTargets) {
      includedByCount.set(target, (includedByCount.get(target) ?? 0) + 1);
    }
  }

  return { edges, missingBySource, includedByCount };
};

export const collectReachableIncludes = (
  entryPath: string,
  edges: Map<string, string[]>,
): Set<string> => {
  const visited = new Set<string>();
  const queue = [...(edges.get(entryPath) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === entryPath || visited.has(current)) {
      continue;
    }

    visited.add(current);
    queue.push(...(edges.get(current) ?? []));
  }

  return visited;
};
