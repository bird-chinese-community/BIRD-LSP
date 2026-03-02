export const CLI_MESSAGES = {
  lintNoDiagnostics: "No problems found during linting",
  fmtCheckWriteConflict: "--check and --write cannot be used together",
  fmtInvalidEngine: (engine: string): string =>
    `Invalid formatter engine: "${engine}" (choose from: dprint, builtin)`,
  fmtWritten: "Files formatted successfully",
  fmtAlreadyFormatted: "All files are already properly formatted",
  fmtCheckFailed:
    "Format check failed. Run `birdcc fmt <file> --write` to fix.",
  fmtCheckPassed: "Format check passed — all files look good",
  lspRequiresStdio: "Only `birdcc lsp --stdio` is currently supported",
} as const;

export const createBirdRunnerErrorMessage = (reason: string): string =>
  `bird validation error: ${reason}`;

export const createInvalidPositiveIntegerOptionMessage = (
  optionName: string,
  rawValue: string,
): string => `${optionName} expects a positive integer, received "${rawValue}"`;
