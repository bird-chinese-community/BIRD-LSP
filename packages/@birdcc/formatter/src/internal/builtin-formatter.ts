import type {
  BuiltinFormatOutput,
  BuiltinFormatStats,
  ResolvedFormatOptions,
} from "../types.js";
import {
  isHighRiskExpressionLine,
  normalizeNonRiskLine,
} from "./builtin-risk.js";

const countToken = (text: string, token: string): number => {
  let count = 0;
  for (const char of text) {
    if (char === token) {
      count += 1;
    }
  }
  return count;
};

const countLeadingCloseBraces = (text: string): number => {
  const matched = text.match(/^}+/);
  return matched?.[0]?.length ?? 0;
};

const extractStructuralSegment = (line: string): string => {
  const commentIndex = line.indexOf("#");
  if (commentIndex === -1) {
    return line;
  }

  return line.slice(0, commentIndex).trimEnd();
};

export const normalizeTextWithBuiltin = async (
  text: string,
  options: ResolvedFormatOptions,
  parserProtectedLines: Set<number>,
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
  const formattedLines: string[] = [];

  let blankStreak = 0;
  let indentLevel = 0;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const originalLine = sourceLines[index] ?? "";
    const lineNumber = index + 1;
    stats.linesTotal += 1;

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

    const structuralLine = extractStructuralSegment(line);
    const openCount = countToken(structuralLine, "{");
    const closeCount = countToken(structuralLine, "}");
    const leadingCloseCount = Math.min(
      indentLevel,
      countLeadingCloseBraces(structuralLine),
    );
    indentLevel = Math.max(0, indentLevel - leadingCloseCount);

    const highRiskLine =
      isHighRiskExpressionLine(line) ||
      parserProtectedLines.has(lineNumber) ||
      line.length > options.lineWidth;
    if (highRiskLine) {
      stats.highRiskLines += 1;
    }

    const normalizedContent = highRiskLine ? line : normalizeNonRiskLine(line);
    const formattedLine = `${" ".repeat(options.indentSize * indentLevel)}${normalizedContent}`;

    if (formattedLine !== originalLine) {
      stats.linesTouched += 1;
      if (originalLine.trimStart() !== normalizedContent) {
        stats.indentationAdjustments += 1;
      }
    }

    formattedLines.push(formattedLine);

    const postCloseCount = Math.max(0, closeCount - leadingCloseCount);
    const delta = openCount - postCloseCount;
    indentLevel = Math.max(0, indentLevel + delta);
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
