import { spawnSync } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveCrossFileReferences,
  sniffProjectEntrypoints,
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

const normalizeMessage = (message: string): string =>
  message.replace(/^bird:\s*/i, "").trim();

/** Parses stderr output from `bird -p` into normalized diagnostics. */
export const parseBirdStderr = (stderr: string): BirdDiagnostic[] => {
  const diagnostics: BirdDiagnostic[] = [];
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const colonPattern =
    /^(?<file>.+?):(?<line>\d+):(?<column>\d+)\s+(?<message>.+)$/;
  const parseErrorPattern =
    /^Parse error\s+(?<file>.+),\s+line\s+(?<line>\d+):\s*(?<message>.+)$/i;
  const legacyPattern =
    /^(?<file>.+),\s+line\s+(?<line>\d+):(?<column>\d+)\s+(?<message>.+)$/i;

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

const formatIoError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const readUtf8File = async (filePath: string): Promise<string> => {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read file '${filePath}': ${formatIoError(error)}`,
    );
  }
};

const createTempFilePath = (filePath: string): string =>
  `${filePath}.birdcc-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const writeUtf8FileAtomically = async (
  filePath: string,
  content: string,
): Promise<void> => {
  const tempPath = createTempFilePath(filePath);

  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw new Error(
      `Failed to write file '${filePath}': ${formatIoError(error)}`,
    );
  }
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

const runCommand = (
  executable: string,
  args: string[],
  cwd?: string,
): CommandExecResult => {
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
    cwd,
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
  // Resolve to absolute so cwd and {file} replacement stay consistent
  // even when filePath is a relative path with directory components.
  const resolvedFilePath = resolve(filePath);
  const validateTemplate = resolveValidateTemplate(validateCommand);
  const commandTokens = parseCommandTokens(validateTemplate);
  if (!commandTokens || commandTokens.length === 0) {
    const message = createBirdRunnerErrorMessage(
      "invalid bird command template",
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

  const expandedCommand = expandValidateCommandArgs(
    commandTokens,
    resolvedFilePath,
  );
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

  const execResult = runCommand(
    expandedCommand.executable,
    expandedCommand.args,
    dirname(resolvedFilePath),
  );

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
  linterEnabled?: boolean;
  withBird?: boolean;
  crossFile?: boolean;
  includeMaxDepth?: number;
  includeMaxFiles?: number;
  includePaths?: string[];
  allowIncludeOutsideWorkspace?: boolean;
  validateCommand?: string;
  severityOverrides?: Record<string, BirdDiagnosticSeverity | "off">;
}

export interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

const toFileUri = (filePath: string): string =>
  pathToFileURL(resolve(filePath)).toString();

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
  severityOverrides?: Record<string, BirdDiagnosticSeverity | "off">,
): BirdDiagnostic[] => {
  if (!severityOverrides) {
    return diagnostics;
  }

  const output: BirdDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const severity = resolveSeverityOverride(
      diagnostic.code,
      severityOverrides,
    );
    if (severity === "off") {
      continue;
    }

    if (!severity || severity === diagnostic.severity) {
      output.push(diagnostic);
      continue;
    }

    output.push({
      ...diagnostic,
      severity,
    });
  }

  return output;
};

const collectAncestorDirs = (filePath: string, maxDepth = 5): string[] => {
  const output: string[] = [];
  let current = resolve(dirname(filePath));

  for (let depth = 0; depth < maxDepth; depth += 1) {
    output.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return output;
};

const resolveAutoProjectContext = async (
  filePath: string,
): Promise<{
  entryUri: string;
  workspaceRootUri: string;
  includeSearchPaths: string[];
}> => {
  const currentDocumentUri = toFileUri(filePath);
  const ancestors = collectAncestorDirs(filePath);
  let best:
    | {
        rootPath: string;
        entryPath: string;
        score: number;
      }
    | undefined;

  for (const rootPath of ancestors) {
    const detection = await sniffProjectEntrypoints(rootPath, {
      maxDepth: 8,
      maxFiles: 2_000,
    });
    if (!detection.primary) {
      continue;
    }

    const entryPath = resolve(rootPath, detection.primary.path);
    const score = detection.primary.score;
    if (!best || score > best.score) {
      best = {
        rootPath,
        entryPath,
        score,
      };
    }

    if (score >= 80) {
      break;
    }
  }

  if (!best) {
    const workspaceRootUri = toFileUri(dirname(resolve(filePath)));
    return {
      entryUri: currentDocumentUri,
      workspaceRootUri,
      includeSearchPaths: [workspaceRootUri],
    };
  }

  const workspaceRootUri = toFileUri(best.rootPath);
  return {
    entryUri: toFileUri(best.entryPath),
    workspaceRootUri,
    includeSearchPaths: [workspaceRootUri, toFileUri(dirname(best.entryPath))],
  };
};

const runCrossFileLint = async (
  filePath: string,
  options: LintOptions,
): Promise<BirdccLintOutput> => {
  const entryText = await readUtf8File(filePath);
  const currentDocumentUri = toFileUri(filePath);
  const workspaceRootUri = toFileUri(dirname(resolve(filePath)));
  const currentFileLooksLikeEntry = /^\s*include\s+/mu.test(entryText);
  const autoProjectContext = currentFileLooksLikeEntry
    ? {
        entryUri: currentDocumentUri,
        workspaceRootUri,
        includeSearchPaths: [workspaceRootUri],
      }
    : await resolveAutoProjectContext(filePath);
  const entryUri = autoProjectContext.entryUri;
  const includeSearchPaths = [
    ...autoProjectContext.includeSearchPaths,
    ...(options.includePaths ?? []).map((path) => toFileUri(path)),
  ];
  const crossFile = await resolveCrossFileReferences({
    entryUri,
    documents: [{ uri: currentDocumentUri, text: entryText }],
    maxDepth: options.includeMaxDepth,
    maxFiles: options.includeMaxFiles,
    workspaceRootUri: autoProjectContext.workspaceRootUri,
    allowIncludeOutsideWorkspace: options.allowIncludeOutsideWorkspace,
    includeSearchPaths,
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
  if (options.linterEnabled === false && !options.withBird) {
    return { diagnostics: [] };
  }

  const crossFile = options.crossFile !== false;
  const lintOutput = crossFile
    ? await runCrossFileLint(filePath, options)
    : await (async () => {
        const text = await readUtf8File(filePath);
        const uri = toFileUri(filePath);
        const lintResult = await lintBirdConfig(text, { uri });
        return { diagnostics: lintResult.diagnostics };
      })();

  const diagnostics = [...lintOutput.diagnostics];

  if (options.withBird) {
    const birdResult = runBirdValidation(filePath, options.validateCommand);
    diagnostics.push(...birdResult.diagnostics);
  }

  return {
    diagnostics: applySeverityOverrides(diagnostics, options.severityOverrides),
  };
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
    ...(options.indentSize !== undefined
      ? { indentSize: options.indentSize }
      : {}),
    ...(options.lineWidth !== undefined
      ? { lineWidth: options.lineWidth }
      : {}),
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
    ...(options.engine != null ? { engine: options.engine } : {}),
    ...(options.indentSize != null ? { indentSize: options.indentSize } : {}),
    ...(options.lineWidth != null ? { lineWidth: options.lineWidth } : {}),
    ...(options.safeMode != null ? { safeMode: options.safeMode } : {}),
  };
  const result = await formatBirdConfig(text, formatterOptions);
  return {
    changed: result.changed,
    formattedText: result.text,
  };
};

/** Formats one file and writes back when `options.write` is enabled. */
export const runFmt = async (
  filePath: string,
  options: FmtOptions = {},
): Promise<FmtResult> => {
  const text = await readUtf8File(filePath);
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
    try {
      result = await formatBirdConfigText(text, options);
    } catch (fallbackError) {
      throw new Error(
        `Formatter fallback failed for '${filePath}': ${formatIoError(fallbackError)}`,
      );
    }
  }

  if (options.write && result.changed) {
    await writeUtf8FileAtomically(filePath, result.formattedText);
  }

  return result;
};

/** Starts LSP server over stdio transport. */
export const runLspStdio = async (): Promise<void> => {
  startLspServer();
};
