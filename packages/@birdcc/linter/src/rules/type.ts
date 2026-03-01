import type { BirdDiagnostic } from "@birdcc/core";
import {
  filterAndFunctionDeclarations,
  scalarTypeOfExpression,
  createRuleDiagnostic,
  type BirdRule,
} from "./shared.js";

interface MatchPair {
  left: string;
  right: string;
}

const normalizeLeftExpression = (value: string): string => value.replace(/^\s*if\s+/i, "").trim();

const normalizeRightExpression = (value: string): string =>
  value
    .replace(/\bthen\b.*$/i, "")
    .replace(/[;]+$/, "")
    .trim();

const extractMatches = (text: string): MatchPair[] => {
  const matches: MatchPair[] = [];
  const pattern = /([^;\n]+?)\s*~\s*([^;\n]+)/g;
  let current = pattern.exec(text);

  while (current) {
    const left = normalizeLeftExpression(current[1] ?? "");
    const right = normalizeRightExpression(current[2] ?? "");
    if (left && right) {
      matches.push({ left, right });
    }
    current = pattern.exec(text);
  }

  return matches;
};

const splitSetItems = (setText: string): string[] => {
  const inner = setText.trim().slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const collectExpressionTexts = (text: string): string[] => {
  return text
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const pushUnique = (diagnostics: BirdDiagnostic[], diagnostic: BirdDiagnostic): void => {
  if (
    diagnostics.some(
      (item) =>
        item.code === diagnostic.code &&
        item.message === diagnostic.message &&
        item.range.line === diagnostic.range.line,
    )
  ) {
    return;
  }

  diagnostics.push(diagnostic);
};

const typeNotIterableRule: BirdRule = ({ text, parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const snippet of collectExpressionTexts(text)) {
    for (const match of extractMatches(snippet)) {
      if (match.right.startsWith("[") && match.right.endsWith("]")) {
        continue;
      }

      pushUnique(
        diagnostics,
        createRuleDiagnostic(
          "type/not-iterable",
          `Type '${match.right}' is not iterable in match expression '${match.left} ~ ${match.right}'`,
          { line: 1, column: 1, endLine: 1, endColumn: 1 },
        ),
      );
    }
  }

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const match of declaration.matches) {
      const right = normalizeRightExpression(match.right);
      if (right.startsWith("[") && right.endsWith("]")) {
        continue;
      }

      pushUnique(
        diagnostics,
        createRuleDiagnostic(
          "type/not-iterable",
          `Type '${right}' is not iterable in match expression '${match.left} ${match.operator} ${match.right}'`,
          match,
        ),
      );
    }
  }

  return diagnostics;
};

const typeSetIncompatibleRule: BirdRule = ({ text, parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  const evaluateSetCompatibility = (left: string, right: string): void => {
    const normalizedRight = normalizeRightExpression(right);
    if (!normalizedRight.startsWith("[") || !normalizedRight.endsWith("]")) {
      return;
    }

    const leftType = scalarTypeOfExpression(left);
    if (leftType === "unknown") {
      return;
    }

    const items = splitSetItems(normalizedRight);
    if (items.length === 0) {
      return;
    }

    const firstType = scalarTypeOfExpression(items[0] ?? "");
    if (firstType === "unknown" || firstType === leftType) {
      return;
    }

    pushUnique(
      diagnostics,
      createRuleDiagnostic(
        "type/set-incompatible",
        `Set-incompatible type (${leftType}) for match set '${normalizedRight}'`,
        { line: 1, column: 1, endLine: 1, endColumn: 1 },
      ),
    );
  };

  for (const snippet of collectExpressionTexts(text)) {
    for (const match of extractMatches(snippet)) {
      evaluateSetCompatibility(match.left, match.right);
    }
  }

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const match of declaration.matches) {
      evaluateSetCompatibility(match.left, match.right);
    }
  }

  return diagnostics;
};

export const typeRules: BirdRule[] = [typeNotIterableRule, typeSetIncompatibleRule];

export const collectTypeRuleDiagnostics = (context: Parameters<BirdRule>[0]): BirdDiagnostic[] => {
  return typeRules.flatMap((rule) => rule(context));
};
