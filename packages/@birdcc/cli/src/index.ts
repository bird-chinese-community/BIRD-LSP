import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { BirdDiagnostic } from "@birdcc/core";
import { formatBirdConfig, type FormatterEngine } from "@birdcc/formatter";
import { startLspServer } from "@birdcc/lsp";
import { lintBirdConfig } from "@birdcc/linter";
import {
  createBirdcRunnerWarningMessage,
  createBirdcStatusWarningMessage,
  createBirdRunnerErrorMessage,
} from "./messages.js";

export interface BirdValidateResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  diagnostics: BirdDiagnostic[];
}

export interface BirdcQueryResult {
  command: string;
  query: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  diagnostics: BirdDiagnostic[];
}

interface BirdcProtocolRuntimeState {
  name: string;
  protocol: string;
  state: string;
}

interface BirdcRuntimeState {
  statusReady: boolean;
  protocols: BirdcProtocolRuntimeState[];
}

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

const createWarningDiagnostic = (code: string, message: string): BirdDiagnostic => ({
  code,
  message,
  severity: "warning",
  source: "bird",
  range: createRange(1, 1),
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

const COMMAND_TIMEOUT_MS = 10_000;
const BIRDC_DEFAULT_COMMAND = "birdc -r";
const BIRDC_COMMON_ERROR_PATTERN =
  /(unable to connect|connection refused|cannot connect|cannot open|no such file|not found|failed|error|timeout|timed out|broken pipe)/i;
const BIRDC_NON_UP_STATES = new Set([
  "start",
  "down",
  "stop",
  "flush",
  "feed",
  "idle",
  "active",
  "connect",
  "opensent",
  "openconfirm",
  "passive",
]);

const sanitizeBirdcLine = (lineText: string): string =>
  lineText.replace(/^\d{4}(?:[-\s]|$)/, "").trim();

const firstMeaningfulLine = (...parts: (string | undefined)[]): string | null => {
  const lines = parts
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines[0] ?? null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

interface ProtocolDeclarationShape {
  kind: "protocol";
  name: string;
  protocolType: string;
  nameRange: Record<string, unknown>;
}

const isProtocolDeclaration = (declaration: unknown): declaration is ProtocolDeclarationShape => {
  if (!isRecord(declaration)) {
    return false;
  }

  return (
    declaration.kind === "protocol" &&
    typeof declaration.name === "string" &&
    typeof declaration.protocolType === "string" &&
    isRecord(declaration.nameRange)
  );
};

const protocolDeclarationsFromParsed = (parsed: unknown) => {
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.program) ||
    !Array.isArray(parsed.program.declarations)
  ) {
    return [] as Array<{
      name: string;
      protocolType: string;
      nameRange: { line: number; column: number; endLine: number; endColumn: number };
    }>;
  }

  return parsed.program.declarations.filter(isProtocolDeclaration).map((declaration) => {
    const range = declaration.nameRange;
    return {
      name: declaration.name,
      protocolType: declaration.protocolType,
      nameRange: {
        line: toNumber(String(range.line ?? "1"), 1),
        column: toNumber(String(range.column ?? "1"), 1),
        endLine: toNumber(String(range.endLine ?? range.line ?? "1"), 1),
        endColumn: toNumber(String(range.endColumn ?? range.column ?? "1"), 1),
      },
    };
  });
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

interface CommandExecResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  errorReason?: string;
}

const runCommand = (commandTokens: string[], input?: string): CommandExecResult => {
  if (commandTokens.length === 0) {
    return {
      command: "",
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorReason: "empty command",
    };
  }

  const [executable, ...args] = commandTokens;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    input,
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: "SIGTERM",
  });

  if (result.error) {
    return {
      command: commandTokens.join(" "),
      exitCode: 1,
      stdout: "",
      stderr: "",
      errorReason: formatSpawnError(result.error as NodeJS.ErrnoException),
    };
  }

  return {
    command: commandTokens.join(" "),
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

export const runBirdcReadOnlyQuery = (
  query: string,
  command = BIRDC_DEFAULT_COMMAND,
): BirdcQueryResult => {
  const commandTokens = parseCommandTokens(command);
  if (!commandTokens || commandTokens.length === 0) {
    const message = createBirdcRunnerWarningMessage("invalid birdc command template");
    return {
      command,
      query,
      exitCode: 1,
      stdout: "",
      stderr: message,
      diagnostics: [createWarningDiagnostic("birdc/runner-warning", message)],
    };
  }

  const execResult = runCommand(commandTokens, `${query}\nquit\n`);
  if (execResult.errorReason) {
    const message = createBirdcRunnerWarningMessage(execResult.errorReason);
    return {
      command: execResult.command,
      query,
      exitCode: execResult.exitCode,
      stdout: execResult.stdout,
      stderr: message,
      diagnostics: [createWarningDiagnostic("birdc/runner-warning", message)],
    };
  }

  const { stdout, stderr, exitCode } = execResult;

  if (exitCode !== 0 || BIRDC_COMMON_ERROR_PATTERN.test(stderr)) {
    const hint = firstMeaningfulLine(stderr, stdout) ?? `exit code ${exitCode}`;
    const message = createBirdcRunnerWarningMessage(hint);
    return {
      command,
      query,
      exitCode,
      stdout,
      stderr,
      diagnostics: [createWarningDiagnostic("birdc/runner-warning", message)],
    };
  }

  return {
    command,
    query,
    exitCode,
    stdout,
    stderr,
    diagnostics: [],
  };
};

export const parseBirdcStatusOutput = (
  stdout: string,
  stderr: string,
  exitCode: number,
): BirdDiagnostic[] => {
  if (exitCode !== 0 || BIRDC_COMMON_ERROR_PATTERN.test(stderr)) {
    return [];
  }

  const lines = stdout
    .split(/\r?\n/)
    .map(sanitizeBirdcLine)
    .filter((line) => line.length > 0);
  const readyDetected = lines.some((line) => /\bready\b/i.test(line));

  if (readyDetected) {
    return [];
  }

  return [createWarningDiagnostic("birdc/status-warning", createBirdcStatusWarningMessage())];
};

export const parseBirdcProtocolsOutput = (stdout: string): BirdcProtocolRuntimeState[] => {
  const protocols: BirdcProtocolRuntimeState[] = [];
  const protocolRowPattern = /^(?<name>\S+)\s+(?<protocol>\S+)\s+\S+\s+(?<state>\S+)/;
  const protocolHeaderPattern = /^name\s+proto\s+table\s+state\b/i;
  const lines = stdout
    .split(/\r?\n/)
    .map(sanitizeBirdcLine)
    .filter((line) => line.length > 0);

  for (const lineText of lines) {
    const lowered = lineText.toLowerCase();
    if (lowered.startsWith("bird ")) {
      continue;
    }

    if (protocolHeaderPattern.test(lineText)) {
      continue;
    }

    const matched = lineText.match(protocolRowPattern);
    if (!matched?.groups) {
      continue;
    }
    const name = matched.groups.name;
    const protocol = matched.groups.protocol;
    const state = matched.groups.state;

    if (!/^[a-z][a-z0-9_-]*$/i.test(state)) {
      continue;
    }

    protocols.push({
      name,
      protocol,
      state: state.toLowerCase(),
    });
  }

  return protocols;
};

export const createBirdcDiagnostics = (
  parsed: unknown,
  runtimeState: BirdcRuntimeState,
): BirdDiagnostic[] => {
  if (!runtimeState.statusReady) {
    return [];
  }

  const diagnostics: BirdDiagnostic[] = [];
  const runtimeMap = new Map(
    runtimeState.protocols.map((item) => [item.name.toLowerCase(), item] as const),
  );

  for (const declaration of protocolDeclarationsFromParsed(parsed)) {
    const runtimeProtocol = runtimeMap.get(declaration.name.toLowerCase());
    if (!runtimeProtocol) {
      diagnostics.push({
        code: "birdc/protocol-not-found",
        message: `Protocol '${declaration.name}' not found in birdc runtime output`,
        severity: "warning",
        source: "bird",
        range: declaration.nameRange,
      });
      continue;
    }

    if (BIRDC_NON_UP_STATES.has(runtimeProtocol.state)) {
      diagnostics.push({
        code: "birdc/protocol-not-up",
        message: `Protocol '${declaration.name}' runtime state is '${runtimeProtocol.state}'`,
        severity: "warning",
        source: "bird",
        range: declaration.nameRange,
      });
    }
  }

  return diagnostics;
};

/** Executes external bird validation command and converts stderr into diagnostics. */
export const runBirdValidation = (
  filePath: string,
  validateCommand = "bird -p -c {file}",
): BirdValidateResult => {
  const commandTokens = parseCommandTokens(validateCommand);
  if (!commandTokens || commandTokens.length === 0) {
    const message = createBirdRunnerErrorMessage("invalid bird command template");
    return {
      command: validateCommand,
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

  const replacedCommandTokens = commandTokens.map((token) => token.replaceAll("{file}", filePath));
  const execResult = runCommand(replacedCommandTokens);

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
  validateCommand?: string;
  withBirdc?: boolean;
  birdcCommand?: string;
}

export interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

/** Lints one config file and optionally appends diagnostics from `bird -p` and `birdc`. */
export const runLint = async (
  filePath: string,
  options: LintOptions = {},
): Promise<BirdccLintOutput> => {
  const text = await readFile(filePath, "utf8");
  const lintResult = await lintBirdConfig(text);
  const diagnostics = [...lintResult.diagnostics];

  if (options.withBird) {
    const birdResult = runBirdValidation(filePath, options.validateCommand);
    diagnostics.push(...birdResult.diagnostics);
  }

  if (options.withBirdc) {
    const statusResult = runBirdcReadOnlyQuery("show status", options.birdcCommand);
    diagnostics.push(...statusResult.diagnostics);

    if (statusResult.diagnostics.length === 0) {
      const statusDiagnostics = parseBirdcStatusOutput(
        statusResult.stdout,
        statusResult.stderr,
        statusResult.exitCode,
      );
      diagnostics.push(...statusDiagnostics);
      const statusReady = statusDiagnostics.length === 0;

      if (!statusReady) {
        return { diagnostics };
      }

      const protocolsResult = runBirdcReadOnlyQuery("show protocols", options.birdcCommand);
      diagnostics.push(...protocolsResult.diagnostics);

      if (protocolsResult.diagnostics.length === 0) {
        const runtimeState: BirdcRuntimeState = {
          statusReady,
          protocols: parseBirdcProtocolsOutput(protocolsResult.stdout),
        };
        diagnostics.push(...createBirdcDiagnostics(lintResult.parsed, runtimeState));
      }
    }
  }

  return { diagnostics };
};

export interface FmtResult {
  changed: boolean;
  formattedText: string;
}

/** Builtin deterministic formatter wrapper used for safe fallback paths. */
export const formatBirdConfigText = (text: string): FmtResult => {
  const result = formatBirdConfig(text, { engine: "builtin" });
  return {
    changed: result.changed,
    formattedText: result.text,
  };
};

export interface FmtOptions {
  write?: boolean;
  engine?: FormatterEngine;
}

const formatWithFormatterPackage = (text: string, engine?: FormatterEngine): FmtResult => {
  const result = formatBirdConfig(text, engine ? { engine } : {});
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
    result = formatWithFormatterPackage(text, options.engine);
  } catch (error) {
    if (options.engine) {
      throw error;
    }

    console.error(
      `Formatting with @birdcc/formatter failed, falling back to builtin formatter: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    result = formatBirdConfigText(text);
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
