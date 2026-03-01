import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveCrossFileReferences,
  type BirdDiagnostic,
  type BirdDiagnosticSeverity,
} from "@birdcc/core";
import { formatBirdConfig, type FormatterEngine } from "@birdcc/formatter";
import { startLspServer } from "@birdcc/lsp";
import { lintBirdConfig, lintResolvedCrossFileGraph } from "@birdcc/linter";
import { resolveSeverityOverride } from "./config.js";
import { createBirdRunnerErrorMessage } from "./messages.js";

export interface BirdValidateResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  diagnostics: BirdDiagnostic[];
}

const COMMAND_TIMEOUT_MS = 10_000;

const toNumber = (value: string | undefined, fallback = 1): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const createRange = (line: number, column: number, width = 1) => ({
  line,
  column,
  endLine: line,
  endColumn: column + width,
});

const normalizeMessage = (message: string): string => message.replace(/^bird:\s*/i, "").trim();

/** Parses stderr output from `bird -p` into normalized diagnostics. */
export const parseBirdStderr = (stderr: string): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const colonPattern = /^(?<file>.+?):(?<line>\d+):(?<column>\d+)\s+(?<message>.+)$/;
  const parseErrorPattern = /^Parse error\s+(?<file>.+),\s+line\s+(?<line>\d+):\s*(?<message>.+)$/i;
  const legacyPattern = /^(?<file>.+),\s+line\s+(?<line>\d+):(?<column>\d+)\s+(?<message>.+)$/i;

  for (const lineText of lines) {
    const matched =
      lineText.match(colonPattern) ??
      lineText.match(parseErrorPattern) ??
      lineText.match(legacyPattern);

    if (!matched?.groups) {
      diagnostics.push({
        code: "bird/parse-error",
        message: normalizeMessage(lineText),
        severity: "error",
        source: "bird",
        range: createRange(1, 1),
      });
      continue;
    }

    const message = normalizeMessage(matched.groups.message);
    const lineNo = toNumber(matched.groups.line, 1);
    const columnNo = toNumber(matched.groups.column, 1);

    diagnostics.push({
      code: "bird/parse-error",
      message,
      severity: "error",
      source: "bird",
      range: createRange(lineNo, columnNo),
    });
  }

  return diagnostics;
};

const parseCommandTokens = (command: string): string[] | null => {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      if (quote === "'") {
        current += char;
        continue;
      }
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping || quote) {
    return null;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

const formatSpawnError = (error: NodeJS.ErrnoException): string => {
  if (error.code === "ETIMEDOUT") {
    return `process timed out after ${COMMAND_TIMEOUT_MS}ms`;
  }

  return error.message;
};

const isCommandPathSafe = (filePath: string): boolean => {
  const forbiddenMetacharacters = new Set([";", "|", "&", "`", "$", "<", ">"]);

  for (const character of filePath) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127) {
      return false;
    }

    if (forbiddenMetacharacters.has(character)) {
      return false;
    }
  }

  return true;
};

interface CommandExecResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  errorReason?: string;
}

const runCommand = (executable: string, args: string[]): CommandExecResult => {
  if (!executable) {
    return {
      command: "",
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorReason: "empty command",
    };
  }

  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: "SIGTERM",
  });

  if (result.error) {
    return {
      command: [executable, ...args].join(" "),
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorReason: formatSpawnError(result.error as NodeJS.ErrnoException),
    };
  }

  return {
    command: [executable, ...args].join(" "),
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const expandValidateCommandArgs = (
  commandTokens: string[],
  filePath: string,
): { executable: string; args: string[] } | null => {
  if (!isCommandPathSafe(filePath)) {
    return null;
  }

  if (commandTokens.length === 0) {
    return null;
  }

  const [executable, ...args] = commandTokens;
  if (executable.includes("{file}")) {
    return null;
  }

  let replaced = false;
  const expandedArgs = args.map((token) => {
    if (!token.includes("{file}")) {
      return token;
    }

    replaced = true;
    return token.replaceAll("{file}", filePath);
  });

  if (!replaced) {
    expandedArgs.push(filePath);
  }

  return {
    executable,
    args: expandedArgs,
  };
};

const resolveValidateTemplate = (validateCommand?: string): string => {
  if (validateCommand && validateCommand.trim().length > 0) {
    return validateCommand;
  }

  const birdBin = process.env.BIRD_BIN?.trim();
  if (birdBin) {
    return `"${birdBin}" -p -c {file}`;
  }

  return "bird -p -c {file}";
};

/** Executes external bird validation command and converts stderr into diagnostics. */
export const runBirdValidation = (
  filePath: string,
  validateCommand?: string,
): BirdValidateResult => {
  const validateTemplate = resolveValidateTemplate(validateCommand);
  const commandTokens = parseCommandTokens(validateTemplate);
  if (!commandTokens || commandTokens.length === 0) {
    const message = createBirdRunnerErrorMessage("invalid bird command template");
    return {
      command: validateTemplate,
      exitCode: 1,
      stdout: "",
      stderr: message,
      diagnostics: [
        {
          code: "bird/runner-error",
          message,
          severity: "error",
          source: "bird",
          range: createRange(1, 1),
        },
      ],
    };
  }

  const expandedCommand = expandValidateCommandArgs(commandTokens, filePath);
  if (!expandedCommand) {
    const message = createBirdRunnerErrorMessage(
      "invalid bird command template or unsafe file path for command execution",
    );
    return {
      command: validateTemplate,
      exitCode: 1,
      stdout: "",
      stderr: message,
      diagnostics: [
        {
          code: "bird/runner-error",
          message,
          severity: "error",
          source: "bird",
          range: createRange(1, 1),
        },
      ],
    };
  }

  const execResult = runCommand(expandedCommand.executable, expandedCommand.args);

  if (execResult.errorReason) {
    const message = createBirdRunnerErrorMessage(execResult.errorReason);
    return {
      command: execResult.command,
      exitCode: 1,
      stdout: "",
      stderr: message,
      diagnostics: [
        {
          code: "bird/runner-error",
          message,
          severity: "error",
          source: "bird",
          range: createRange(1, 1),
        },
      ],
    };
  }

  const stderr = execResult.stderr;

  return {
    command: execResult.command,
    exitCode: execResult.exitCode,
    stdout: execResult.stdout,
    stderr,
    diagnostics: parseBirdStderr(stderr),
  };
};

export interface LintOptions {
  withBird?: boolean;
  crossFile?: boolean;
  includeMaxDepth?: number;
  includeMaxFiles?: number;
  validateCommand?: string;
  severityOverrides?: Record<string, BirdDiagnosticSeverity>;
}

export interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

const toFileUri = (filePath: string): string => pathToFileURL(resolve(filePath)).toString();

const diagnosticDedupKey = (diagnostic: BirdDiagnostic): string =>
  [
    diagnostic.code,
    diagnostic.message,
    diagnostic.uri ?? "",
    diagnostic.range.line,
    diagnostic.range.column,
    diagnostic.range.endLine,
    diagnostic.range.endColumn,
  ].join(":");

const dedupeDiagnostics = (diagnostics: BirdDiagnostic[]): BirdDiagnostic[] => {
  const seen = new Set<string>();
  const output: BirdDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = diagnosticDedupKey(diagnostic);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(diagnostic);
  }

  return output;
};

const applySeverityOverrides = (
  diagnostics: BirdDiagnostic[],
  severityOverrides?: Record<string, BirdDiagnosticSeverity>,
): BirdDiagnostic[] => {
  if (!severityOverrides) {
    return diagnostics;
  }

  return diagnostics.map((diagnostic) => {
    const severity = resolveSeverityOverride(diagnostic.code, severityOverrides);
    if (!severity || severity === diagnostic.severity) {
      return diagnostic;
    }

    return {
      ...diagnostic,
      severity,
    };
  });
};

const runCrossFileLint = async (
  filePath: string,
  options: LintOptions,
): Promise<BirdccLintOutput> => {
  const entryText = await readFile(filePath, "utf8");
  const entryUri = toFileUri(filePath);
  const crossFile = await resolveCrossFileReferences({
    entryUri,
    documents: [{ uri: entryUri, text: entryText }],
    maxDepth: options.includeMaxDepth,
    maxFiles: options.includeMaxFiles,
    loadFromFileSystem: true,
  });

  const lintResult = await lintResolvedCrossFileGraph(crossFile);
  return { diagnostics: dedupeDiagnostics(lintResult.diagnostics) };
};

/** Lints one config file and optionally appends diagnostics from `bird -p`. */
export const runLint = async (
  filePath: string,
  options: LintOptions = {},
): Promise<BirdccLintOutput> => {
  const crossFile = options.crossFile !== false;
  const lintOutput = crossFile
    ? await runCrossFileLint(filePath, options)
    : await (async () => {
        const text = await readFile(filePath, "utf8");
        const uri = toFileUri(filePath);
        const lintResult = await lintBirdConfig(text, { uri });
        return { diagnostics: lintResult.diagnostics };
      })();

  const diagnostics = [...lintOutput.diagnostics];

  if (options.withBird) {
    const birdResult = runBirdValidation(filePath, options.validateCommand);
    diagnostics.push(...birdResult.diagnostics);
  }

  return { diagnostics: applySeverityOverrides(diagnostics, options.severityOverrides) };
};

export interface FmtResult {
  changed: boolean;
  formattedText: string;
}

/** Builtin deterministic formatter wrapper used for safe fallback paths. */
export const formatBirdConfigText = async (
  text: string,
  options: Omit<FmtOptions, "write" | "engine"> = {},
): Promise<FmtResult> => {
  const formatterOptions = {
    engine: "builtin" as const,
    ...(options.indentSize !== undefined ? { indentSize: options.indentSize } : {}),
    ...(options.lineWidth !== undefined ? { lineWidth: options.lineWidth } : {}),
    ...(options.safeMode !== undefined ? { safeMode: options.safeMode } : {}),
  };
  const result = await formatBirdConfig(text, formatterOptions);
  return {
    changed: result.changed,
    formattedText: result.text,
  };
};

export interface FmtOptions {
  write?: boolean;
  engine?: FormatterEngine;
  indentSize?: number;
  lineWidth?: number;
  safeMode?: boolean;
}

const formatWithFormatterPackage = async (
  text: string,
  options: FmtOptions,
): Promise<FmtResult> => {
  const formatterOptions = {
    ...(options.engine !== undefined ? { engine: options.engine } : {}),
    ...(options.indentSize !== undefined ? { indentSize: options.indentSize } : {}),
    ...(options.lineWidth !== undefined ? { lineWidth: options.lineWidth } : {}),
    ...(options.safeMode !== undefined ? { safeMode: options.safeMode } : {}),
  };
  const result = await formatBirdConfig(text, formatterOptions);
  return {
    changed: result.changed,
    formattedText: result.text,
  };
};

/** Formats one file and writes back when `options.write` is enabled. */
export const runFmt = async (filePath: string, options: FmtOptions = {}): Promise<FmtResult> => {
  const text = await readFile(filePath, "utf8");
  let result: FmtResult;

  try {
    result = await formatWithFormatterPackage(text, options);
  } catch (error) {
    if (options.engine) {
      throw error;
    }

    console.error(
      `Formatting with @birdcc/formatter failed, falling back to builtin formatter: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    result = await formatBirdConfigText(text, options);
  }

  if (options.write && result.changed) {
    await writeFile(filePath, result.formattedText, "utf8");
  }

  return result;
};

/** Starts LSP server over stdio transport. */
export const runLspStdio = async (): Promise<void> => {
  startLspServer();
};
