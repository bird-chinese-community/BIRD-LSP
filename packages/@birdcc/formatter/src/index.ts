import { createContext, type FormatterContext } from "@dprint/formatter";
import { getBuffer as getBirdPluginBuffer } from "@birdcc/dprint-plugin-bird";
import {
  parseBirdConfig,
  type BirdDeclaration,
  type FilterBodyStatement,
  type ParseIssue,
  type ProtocolStatement,
} from "@birdcc/parser";

export type FormatterEngine = "dprint" | "builtin";

export interface FormatBirdConfigOptions {
  engine?: FormatterEngine;
  indentSize?: number;
  lineWidth?: number;
  safeMode?: boolean;
}

interface ResolvedFormatOptions {
  engine: FormatterEngine;
  indentSize: number;
  lineWidth: number;
  safeMode: boolean;
}

export interface BirdFormatResult {
  text: string;
  changed: boolean;
  engine: FormatterEngine;
}

export interface BirdFormatCheckResult {
  changed: boolean;
}

interface BuiltinFormatStats {
  linesTotal: number;
  linesTouched: number;
  blankLinesCollapsed: number;
  indentationAdjustments: number;
  highRiskLines: number;
  parserProtectedLines: number;
}

interface BuiltinFormatOutput {
  text: string;
  stats: BuiltinFormatStats;
}

const DEFAULT_INDENT_SIZE = 2;
const DEFAULT_LINE_WIDTH = 80;
const DEFAULT_SAFE_MODE = true;

const dprintContextCache = new Map<string, FormatterContext>();

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
};

const resolveOptions = (options: FormatBirdConfigOptions = {}): ResolvedFormatOptions => ({
  engine: options.engine ?? "dprint",
  indentSize: normalizePositiveInteger(options.indentSize, DEFAULT_INDENT_SIZE),
  lineWidth: normalizePositiveInteger(options.lineWidth, DEFAULT_LINE_WIDTH),
  safeMode: options.safeMode ?? DEFAULT_SAFE_MODE,
});

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const stripRangeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stripRangeKeys(item));
  }

  if (!value || typeof value !== "object") {
    if (typeof value === "string") {
      return normalizeWhitespace(value);
    }
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      key === "line" ||
      key === "column" ||
      key === "endLine" ||
      key === "endColumn" ||
      key.endsWith("Range")
    ) {
      continue;
    }

    output[key] = stripRangeKeys(nestedValue);
  }

  return output;
};

const normalizeIssue = (issue: ParseIssue): unknown => ({
  code: issue.code,
  message: normalizeWhitespace(issue.message),
});

const normalizeDeclaration = (declaration: BirdDeclaration): unknown => {
  return stripRangeKeys(declaration);
};

const createSemanticFingerprintFromParsed = (
  parsed: Awaited<ReturnType<typeof parseBirdConfig>>,
): string => {
  const hasRuntimeIssue = parsed.issues.some((issue) => issue.code === "parser/runtime-error");

  if (hasRuntimeIssue) {
    throw new Error("Parser runtime unavailable while evaluating formatter safe mode");
  }

  const normalizedProgram = parsed.program.declarations.map((declaration) =>
    normalizeDeclaration(declaration),
  );
  const normalizedIssues = parsed.issues.map((issue) => normalizeIssue(issue));

  return JSON.stringify({
    declarations: normalizedProgram,
    issues: normalizedIssues,
  });
};

const createSemanticFingerprint = async (text: string): Promise<string> => {
  const parsed = await parseBirdConfig(text);
  return createSemanticFingerprintFromParsed(parsed);
};

const assertSafeModeSemanticEquivalence = async (
  before: string,
  after: string,
  beforeFingerprint?: string,
): Promise<void> => {
  const [resolvedBeforeFingerprint, afterFingerprint] = await Promise.all([
    beforeFingerprint ? Promise.resolve(beforeFingerprint) : createSemanticFingerprint(before),
    createSemanticFingerprint(after),
  ]);

  if (resolvedBeforeFingerprint !== afterFingerprint) {
    throw new Error("Formatter safe mode rejected output because semantic fingerprint changed");
  }
};

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

const isHighRiskExpressionLine = (line: string): boolean => {
  const normalized = line.trim();
  if (normalized.length === 0 || isCommentLine(normalized)) {
    return false;
  }

  return /\b(if|then|else|return)\b|[~&|?:]|\[[^\]]*\]|\(/i.test(normalized);
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

const collectProtocolProtectedLines = (
  statements: ProtocolStatement[],
): Array<{ line: number; endLine: number }> => {
  return statements
    .filter((statement) => {
      if (statement.kind === "other") {
        return true;
      }

      if (statement.kind === "import" || statement.kind === "export") {
        return statement.mode === "where";
      }

      if (statement.kind === "channel") {
        return statement.entries.some((entry) => {
          if (entry.kind === "other") {
            return true;
          }
          if (entry.kind === "import" || entry.kind === "export") {
            return entry.mode === "where";
          }
          return false;
        });
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

const contextCacheKey = (options: ResolvedFormatOptions): string =>
  `${options.indentSize}:${options.lineWidth}:${options.safeMode ? "1" : "0"}`;

const getOrCreateDprintContext = (options: ResolvedFormatOptions): FormatterContext => {
  const key = contextCacheKey(options);
  const cached = dprintContextCache.get(key);
  if (cached) {
    return cached;
  }

  const context = createContext({
    indentWidth: options.indentSize,
    lineWidth: options.lineWidth,
  });
  context.addPlugin(getBirdPluginBuffer(), {
    lineWidth: options.lineWidth,
    indentWidth: options.indentSize,
    safeMode: options.safeMode,
  });

  dprintContextCache.set(key, context);
  return context;
};

const formatWithEmbeddedDprint = async (
  text: string,
  options: ResolvedFormatOptions,
): Promise<BirdFormatResult> => {
  const context = getOrCreateDprintContext(options);
  const formattedText = context.formatText({
    filePath: "bird.conf",
    fileText: text,
  });

  if (options.safeMode && formattedText !== text) {
    await assertSafeModeSemanticEquivalence(text, formattedText);
  }

  return {
    text: formattedText,
    changed: formattedText !== text,
    engine: "dprint",
  };
};

const formatWithBuiltin = async (
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

export const formatBirdConfig = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BirdFormatResult> => {
  const resolved = resolveOptions(options);
  const explicitEngine = options.engine;

  if (resolved.engine === "dprint") {
    try {
      return await formatWithEmbeddedDprint(text, resolved);
    } catch (error) {
      if (explicitEngine === "dprint") {
        throw new Error(
          `Formatting with 'dprint' failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  return formatWithBuiltin(text, resolved);
};

export const checkBirdConfigFormat = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BirdFormatCheckResult> => ({
  changed: (await formatBirdConfig(text, options)).changed,
});

/** Internal-only helper for regression tests. */
export const __formatBirdConfigBuiltinForTest = async (
  text: string,
  options: FormatBirdConfigOptions = {},
): Promise<BuiltinFormatOutput> => {
  const parsed = await parseBirdConfig(text);
  const parserProtectedLines = collectParserProtectedLinesFromParsed(parsed);
  return normalizeTextWithBuiltin(text, resolveOptions(options), parserProtectedLines);
};

/** Internal-only helper for deterministic unit tests. */
export const __resetFormatterStateForTest = (): void => {
  dprintContextCache.clear();
};
