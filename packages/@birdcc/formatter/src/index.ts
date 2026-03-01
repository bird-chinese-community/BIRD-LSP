import { spawnSync } from "node:child_process";

export type FormatterEngine = "dprint" | "builtin";

export interface FormatBirdConfigOptions {
  engine?: FormatterEngine;
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
}

interface BuiltinFormatOutput {
  text: string;
  stats: BuiltinFormatStats;
}

const FORMATTER_TIMEOUT_MS = 30_000;
const FORMATTER_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const INDENT = "  ";

const countToken = (text: string, token: string): number => {
  let count = 0;
  for (const char of text) {
    if (char === token) {
      count += 1;
    }
  }
  return count;
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

const normalizeTextWithBuiltin = (text: string): BuiltinFormatOutput => {
  const stats: BuiltinFormatStats = {
    linesTotal: 0,
    linesTouched: 0,
    blankLinesCollapsed: 0,
    indentationAdjustments: 0,
    highRiskLines: 0,
  };

  const sourceLines = text.replace(/\r\n?/g, "\n").split("\n");
  const formattedLines: string[] = [];

  let blankStreak = 0;
  let indentLevel = 0;

  for (const originalLine of sourceLines) {
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

    const leadingCloseCount = countToken(line, "}");
    const leadingOpenCount = countToken(line, "{");
    if (line.startsWith("}")) {
      const drop = Math.min(indentLevel, Math.max(1, leadingCloseCount));
      indentLevel = Math.max(0, indentLevel - drop);
    }

    const highRiskLine = isHighRiskExpressionLine(line);
    if (highRiskLine) {
      stats.highRiskLines += 1;
    }

    const normalizedContent = highRiskLine ? line : normalizeNonRiskLine(line);
    const formattedLine = `${INDENT.repeat(indentLevel)}${normalizedContent}`;

    if (formattedLine !== originalLine) {
      stats.linesTouched += 1;
      if (originalLine.trimStart() !== normalizedContent) {
        stats.indentationAdjustments += 1;
      }
    }

    formattedLines.push(formattedLine);

    const openCount = leadingOpenCount;
    const closeCount = leadingCloseCount;
    const delta = openCount - closeCount;
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

const runExternalFormatter = (
  command: string,
  args: string[],
  text: string,
): { ok: true; output: string } | { ok: false; reason: string } => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: text,
    timeout: FORMATTER_TIMEOUT_MS,
    maxBuffer: FORMATTER_MAX_BUFFER_BYTES,
  });

  if (result.error) {
    return { ok: false, reason: result.error.message };
  }

  if ((result.status ?? 1) !== 0) {
    const message = result.stderr?.trim() || `exit code ${result.status ?? 1}`;
    return { ok: false, reason: message };
  }

  return {
    ok: true,
    output: result.stdout?.length ? result.stdout : text,
  };
};

const tryDprint = (text: string): { ok: true; text: string } | { ok: false; reason: string } => {
  const result = runExternalFormatter("dprint", ["fmt", "--stdin", "bird.conf"], text);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return { ok: true, text: result.output };
};

export const formatBirdConfig = (
  text: string,
  options: FormatBirdConfigOptions = {},
): BirdFormatResult => {
  const explicitEngine = options.engine;
  const requestedEngine = explicitEngine ?? "dprint";
  const allowFallback = explicitEngine === undefined;

  if (requestedEngine === "dprint") {
    const dprintOutput = tryDprint(text);
    if (dprintOutput.ok) {
      return {
        text: dprintOutput.text,
        changed: dprintOutput.text !== text,
        engine: "dprint",
      };
    }

    if (!allowFallback) {
      throw new Error(`Formatting with 'dprint' failed: ${dprintOutput.reason}`);
    }
  }

  const builtinOutput = normalizeTextWithBuiltin(text);
  return {
    text: builtinOutput.text,
    changed: builtinOutput.text !== text,
    engine: "builtin",
  };
};

export const checkBirdConfigFormat = (
  text: string,
  options: FormatBirdConfigOptions = {},
): BirdFormatCheckResult => ({
  changed: formatBirdConfig(text, options).changed,
});

/** Internal-only helper for regression tests. */
export const __formatBirdConfigBuiltinForTest = (text: string): BuiltinFormatOutput =>
  normalizeTextWithBuiltin(text);
