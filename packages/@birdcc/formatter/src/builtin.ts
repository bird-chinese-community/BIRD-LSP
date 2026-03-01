import {
  parseBirdConfig,
  type ChannelEntry,
  type FilterBodyStatement,
  type ProtocolStatement,
} from "@birdcc/parser";

import { resolveOptions } from "./options.js";
import {
  assertSafeModeSemanticEquivalence,
  createSemanticFingerprintFromParsed,
} from "./semantic.js";
import type {
  BuiltinFormatOutput,
  BuiltinFormatStats,
  BirdFormatResult,
  FormatBirdConfigOptions,
  ResolvedFormatOptions,
} from "./types.js";

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

const isCommentLine = (line: string): boolean => line.trimStart().startsWith("#");

const HIGH_RISK_KEYWORDS = ["if", "then", "else", "return"] as const;
const HIGH_RISK_OPERATORS = ["~", "&", "|", "?", ":", "(", "[", "]"] as const;

const isWordCharacter = (value: string): boolean => /[A-Za-z0-9_]/.test(value);

const containsKeywordAsWord = (text: string, keyword: string): boolean => {
  let startIndex = 0;
  while (startIndex <= text.length) {
    const foundIndex = text.indexOf(keyword, startIndex);
    if (foundIndex === -1) {
      return false;
    }

    const endIndex = foundIndex + keyword.length;
    const leftChar = foundIndex === 0 ? "" : (text[foundIndex - 1] ?? "");
    const rightChar = endIndex >= text.length ? "" : (text[endIndex] ?? "");
    const leftOk = leftChar === "" || !isWordCharacter(leftChar);
    const rightOk = rightChar === "" || !isWordCharacter(rightChar);

    if (leftOk && rightOk) {
      return true;
    }

    startIndex = endIndex;
  }

  return false;
};

const isHighRiskExpressionLine = (line: string): boolean => {
  const normalized = line.trim();
  if (normalized.length === 0 || isCommentLine(normalized)) {
    return false;
  }

  const lowered = normalized.toLowerCase();
  const keywordRisk = HIGH_RISK_KEYWORDS.some((keyword) => containsKeywordAsWord(lowered, keyword));
  const operatorRisk = HIGH_RISK_OPERATORS.some((operator) => normalized.includes(operator));
  return keywordRisk || operatorRisk;
};

const normalizeNonRiskLine = (line: string): string => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || isCommentLine(trimmed)) {
    return trimmed;
  }

  if (trimmed === "}" || trimmed === "};") {
    return trimmed;
  }

  if (trimmed.endsWith("{")) {
    return `${trimmed.slice(0, -1).trimEnd()} {`;
  }

  if (trimmed.endsWith(";")) {
    return `${trimmed.slice(0, -1).trimEnd()};`;
  }

  return trimmed;
};

const collectStatementRanges = (
  statements: FilterBodyStatement[],
): Array<{ line: number; endLine: number }> => {
  return statements.map((statement) => ({
    line: statement.line,
    endLine: statement.endLine,
  }));
};

const hasProtectedProtocolEntry = (entry: ProtocolStatement | ChannelEntry): boolean => {
  if (entry.kind === "other") {
    return true;
  }

  if (entry.kind === "import" || entry.kind === "export") {
    return entry.mode === "where";
  }

  return false;
};

const collectProtocolProtectedLines = (
  statements: ProtocolStatement[],
): Array<{ line: number; endLine: number }> => {
  return statements
    .filter((statement) => {
      if (hasProtectedProtocolEntry(statement)) {
        return true;
      }

      if (statement.kind === "channel") {
        return statement.entries.some((entry) => hasProtectedProtocolEntry(entry));
      }

      return false;
    })
    .map((statement) => ({
      line: statement.line,
      endLine: statement.endLine,
    }));
};

const collectParserProtectedLinesFromParsed = (
  parsed: Awaited<ReturnType<typeof parseBirdConfig>>,
): Set<number> => {
  const protectedLines = new Set<number>();

  for (const issue of parsed.issues) {
    for (let line = issue.line; line <= issue.endLine; line += 1) {
      protectedLines.add(line);
    }
  }

  for (const declaration of parsed.program.declarations) {
    const protectedRanges: Array<{ line: number; endLine: number }> = [];

    if (declaration.kind === "filter" || declaration.kind === "function") {
      protectedRanges.push(...collectStatementRanges(declaration.statements));
    }

    if (declaration.kind === "protocol") {
      protectedRanges.push(...collectProtocolProtectedLines(declaration.statements));
    }

    for (const range of protectedRanges) {
      for (let line = range.line; line <= range.endLine; line += 1) {
        protectedLines.add(line);
      }
    }
  }

  return protectedLines;
};

const normalizeTextWithBuiltin = async (
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

    const openCount = countToken(line, "{");
    const closeCount = countToken(line, "}");
    const leadingCloseCount = Math.min(indentLevel, countLeadingCloseBraces(line));
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

  while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === "") {
    formattedLines.pop();
  }

  const formattedText = `${formattedLines.join("\n")}\n`;
  return {
    text: formattedText,
    stats,
  };
};

export const formatWithBuiltin = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BirdFormatResult> => {
  let beforeFingerprint: string | undefined;
  let parserProtectedLines: Set<number>;

  if (options.safeMode) {
    const beforeParsed = await parseBirdConfig(text);
    beforeFingerprint = createSemanticFingerprintFromParsed(beforeParsed);
    parserProtectedLines = collectParserProtectedLinesFromParsed(beforeParsed);
  } else {
    const parsed = await parseBirdConfig(text);
    parserProtectedLines = collectParserProtectedLinesFromParsed(parsed);
  }

  const builtinOutput = await normalizeTextWithBuiltin(text, options, parserProtectedLines);
  if (options.safeMode && builtinOutput.text !== text) {
    await assertSafeModeSemanticEquivalence(text, builtinOutput.text, beforeFingerprint);
  }

  return {
    text: builtinOutput.text,
    changed: builtinOutput.text !== text,
    engine: "builtin",
  };
};

export const formatWithBuiltinForTest = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BuiltinFormatOutput> => {
  const parsed = await parseBirdConfig(text);
  const parserProtectedLines = collectParserProtectedLinesFromParsed(parsed);
  return normalizeTextWithBuiltin(text, resolveOptions(options), parserProtectedLines);
};
