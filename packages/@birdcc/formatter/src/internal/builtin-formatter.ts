import type {
  BuiltinFormatOutput,
  BuiltinFormatStats,
  ResolvedFormatOptions,
} from "../types.js";
import {
  isHighRiskExpressionLine,
  normalizeNonRiskLine,
} from "./builtin-risk.js";
import type { BirdSyntaxLayout } from "@birdcc/parser";

export const normalizeTextWithBuiltin = async (
  text: string,
  options: ResolvedFormatOptions,
  parserProtectedLines: Set<number>,
  syntax: BirdSyntaxLayout,
): Promise<BuiltinFormatOutput> => {
  const stats: BuiltinFormatStats = {
    linesTotal: 0,
    linesTouched: 0,
    blankLinesCollapsed: 0,
    indentationAdjustments: 0,
    highRiskLines: 0,
    parserProtectedLines: parserProtectedLines.size,
  };

  const sourceLines = text.replace(/\r\n?/g, "\n").split("\n");
  const tokensByLine = new Map<number, typeof syntax.structuralTokens>();
  for (const token of syntax.structuralTokens) {
    const tokens = tokensByLine.get(token.line) ?? [];
    tokens.push(token);
    tokensByLine.set(token.line, tokens);
  }
  const formattedLines: string[] = [];

  let blankStreak = 0;
  let indentLevel = 0;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const originalLine = sourceLines[index] ?? "";
    const lineNumber = index + 1;
    stats.linesTotal += 1;
    const tokens = tokensByLine.get(lineNumber) ?? [];
    const openCount = tokens.filter((token) => token.opening).length;
    const closeCount = tokens.length - openCount;
    const leadingCloses = tokens.filter(
      (token) =>
        !token.opening &&
        /^[\s}\]=]*$/u.test(originalLine.slice(0, token.column - 1)),
    ).length;
    const leadingCloseCount = Math.min(indentLevel, leadingCloses);
    indentLevel = Math.max(0, indentLevel - leadingCloseCount);
    const nextIndentLevel = Math.max(
      0,
      indentLevel + openCount - Math.max(0, closeCount - leadingCloseCount),
    );

    if (syntax.preservedLines.has(lineNumber)) {
      formattedLines.push(originalLine);
      blankStreak = 0;
      indentLevel = nextIndentLevel;
      continue;
    }

    const trimmedTrailing = originalLine.replace(/[ \t]+$/g, "");
    const line = trimmedTrailing.trim();

    if (line.length === 0) {
      blankStreak += 1;
      if (blankStreak > 1) {
        stats.blankLinesCollapsed += 1;
        if (originalLine !== "") {
          stats.linesTouched += 1;
        }
        continue;
      }

      formattedLines.push("");
      if (trimmedTrailing !== originalLine) {
        stats.linesTouched += 1;
      }
      continue;
    }

    blankStreak = 0;

    const highRiskLine =
      isHighRiskExpressionLine(line) ||
      parserProtectedLines.has(lineNumber) ||
      line.length > options.lineWidth;
    if (highRiskLine) {
      stats.highRiskLines += 1;
    }

    const commentColumn = syntax.commentColumns.get(lineNumber);
    const code =
      commentColumn === undefined
        ? line
        : originalLine.slice(0, commentColumn - 1).trim();
    const normalizedCode = highRiskLine ? code : normalizeNonRiskLine(code);
    const comment =
      commentColumn === undefined ? "" : originalLine.slice(commentColumn - 1);
    const normalizedContent =
      comment.length > 0
        ? `${normalizedCode}${normalizedCode.length > 0 ? " " : ""}${comment}`
        : normalizedCode;
    const indent = options.useTabs
      ? "\t".repeat(indentLevel)
      : " ".repeat(options.indentSize * indentLevel);
    const formattedLine = `${indent}${normalizedContent}`;

    if (formattedLine !== originalLine) {
      stats.linesTouched += 1;
      if (originalLine.trimStart() !== normalizedContent) {
        stats.indentationAdjustments += 1;
      }
    }

    formattedLines.push(formattedLine);

    indentLevel = nextIndentLevel;
  }

  while (
    formattedLines.length > 0 &&
    formattedLines[formattedLines.length - 1] === ""
  ) {
    formattedLines.pop();
  }

  const formattedText = `${formattedLines.join("\n")}\n`;
  return {
    text: formattedText,
    stats,
  };
};
