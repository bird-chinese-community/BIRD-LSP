import type { BirdDiagnostic } from "@birdcc/core";
import type { FilterBodyStatement, SourceRange } from "@birdcc/parser";
import {
  createRuleDiagnostic,
  filterAndFunctionDeclarations,
  pushUniqueDiagnostic,
  scalarTypeOfExpression,
  type BirdRule,
} from "./shared.js";

interface MatchPair {
  left: string;
  right: string;
}

const normalizeLeftExpression = (value: string): string =>
  value.replace(/^\s*if\s+/i, "").trim();

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

const statementText = (statement: FilterBodyStatement): string => {
  if (statement.kind === "expression") {
    return statement.expressionText;
  }

  if (statement.kind === "other") {
    return statement.text;
  }

  if (statement.kind === "if") {
    return statement.conditionText ?? "";
  }

  if (statement.kind === "return") {
    return statement.valueText ?? "";
  }

  return "";
};

const declarationText = (source: string, range: SourceRange): string => {
  const lines = source.split(/\r?\n/);
  const startLine = Math.max(1, range.line);
  const endLine = Math.max(startLine, range.endLine);
  return lines.slice(startLine - 1, endLine).join("\n");
};

const typeNotIterableRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      const text = statementText(statement);
      if (!text) {
        continue;
      }

      for (const match of extractMatches(text)) {
        if (match.right.startsWith("[") && match.right.endsWith("]")) {
          continue;
        }

        pushUniqueDiagnostic(
          diagnostics,
          seen,
          createRuleDiagnostic(
            "type/not-iterable",
            `Type '${match.right}' is not iterable in match expression '${match.left} ~ ${match.right}'`,
            statement,
          ),
        );
      }
    }

    for (const match of declaration.matches) {
      const right = normalizeRightExpression(match.right);
      if (right.startsWith("[") && right.endsWith("]")) {
        continue;
      }

      pushUniqueDiagnostic(
        diagnostics,
        seen,
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

const typeSetIncompatibleRule: BirdRule = ({ parsed, text }) => {
  const diagnostics: BirdDiagnostic[] = [];
  const seen = new Set<string>();

  const evaluateSetCompatibility = (
    left: string,
    right: string,
    range: SourceRange,
  ): void => {
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

    pushUniqueDiagnostic(
      diagnostics,
      seen,
      createRuleDiagnostic(
        "type/set-incompatible",
        `Set-incompatible type (${leftType}) for match set '${normalizedRight}'`,
        range,
      ),
    );
  };

  for (const declaration of filterAndFunctionDeclarations(parsed)) {
    for (const statement of declaration.statements) {
      const text = statementText(statement);
      if (!text) {
        continue;
      }

      for (const match of extractMatches(text)) {
        evaluateSetCompatibility(match.left, match.right, statement);
      }
    }

    for (const match of declaration.matches) {
      evaluateSetCompatibility(match.left, match.right, match);
    }

    const hasTruncatedSetMatch = declaration.matches.some(
      (match) => match.right.includes("[") && !match.right.includes("]"),
    );

    if (hasTruncatedSetMatch) {
      const sourceText = declarationText(text, declaration);
      for (const match of extractMatches(sourceText)) {
        evaluateSetCompatibility(match.left, match.right, declaration);
      }
    }
  }

  return diagnostics;
};

export const typeRules: BirdRule[] = [
  typeNotIterableRule,
  typeSetIncompatibleRule,
];

export const collectTypeRuleDiagnostics = (
  context: Parameters<BirdRule>[0],
): BirdDiagnostic[] => {
  return typeRules.flatMap((rule) => rule(context));
};
