import type {
  FormatBirdConfigOptions,
  ResolvedFormatOptions,
} from "./types.js";

const DEFAULT_INDENT_SIZE = 2;
const DEFAULT_LINE_WIDTH = 80;
const DEFAULT_SAFE_MODE = true;

const normalizePositiveInteger = (
  value: number | undefined,
  fallback: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
};

export const resolveOptions = (
  options: FormatBirdConfigOptions = {},
): ResolvedFormatOptions => ({
  engine: options.engine ?? "dprint",
  indentSize: normalizePositiveInteger(options.indentSize, DEFAULT_INDENT_SIZE),
  lineWidth: normalizePositiveInteger(options.lineWidth, DEFAULT_LINE_WIDTH),
  safeMode: options.safeMode ?? DEFAULT_SAFE_MODE,
});
