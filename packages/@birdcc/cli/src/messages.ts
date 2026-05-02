import { bold, dim, green, red, yellow } from "yoctocolors";

export const CLI_MESSAGES = {
  lintNoDiagnostics: green("No problems found during linting"),
  fmtCheckWriteConflict: "--check and --write cannot be used together",
  fmtInvalidEngine: (engine: string): string =>
    `Invalid formatter engine: "${engine}" (choose from: dprint, builtin)`,
  fmtWritten: green("Files formatted successfully"),
  fmtAlreadyFormatted: "All files are already properly formatted",
  fmtCheckFailed:
    "Format check failed. Run `birdcc fmt <file> --write` to fix.",
  fmtCheckPassed: green("Format check passed — all files look good"),
  lspRequiresStdio: "Only `birdcc lsp --stdio` is currently supported",
} as const;

export const severityColor = (severity: string, text: string): string => {
  if (severity === "error") return red(text);
  if (severity === "warning") return yellow(text);
  return text;
};

export const boldSeverity = (severity: string): string => {
  const upper = severity.toUpperCase();
  if (severity === "error") return bold(red(upper));
  if (severity === "warning") return bold(yellow(upper));
  return bold(upper);
};

/** Verbose-log to stderr with dim styling. Accepts multiple lines. */
export const vlog = (...messages: string[]): void => {
  for (const msg of messages) {
    console.error(dim(`[verbose] ${msg}`));
  }
};

/** Verbose timing log — single dimmed line with elapsed ms. */
export const vtime = (label: string, ms: number): void => {
  console.error(dim(`[verbose] ${label} completed in ${ms}ms`));
};

export const createBirdRunnerErrorMessage = (reason: string): string =>
  `bird validation error: ${reason}`;

export const createInvalidPositiveIntegerOptionMessage = (
  optionName: string,
  rawValue: string,
): string => `${optionName} expects a positive integer, received "${rawValue}"`;

export const createInvalidFormatOptionMessage = (value: string): string =>
  `Invalid --format value "${value}". Use "json" or "text".`;

export const createVerboseTimingMessage = (label: string, ms: number): string =>
  dim(`[verbose] ${label} completed in ${ms}ms`);
