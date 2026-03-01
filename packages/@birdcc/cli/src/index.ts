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

const shellEscape = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const BIRDC_DEFAULT_COMMAND = "birdc -r";
const BIRDC_COMMON_ERROR_PATTERN =
  /(unable to connect|connection refused|no such file|not found|failed|error)/i;
const BIRDC_NON_UP_STATES = new Set(["start", "down", "stop", "flush", "feed"]);

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

const protocolDeclarationsFromParsed = (parsed: unknown) => {
  const declarations = (parsed as { program?: { declarations?: unknown[] } })?.program
    ?.declarations;
  if (!Array.isArray(declarations)) {
    return [] as Array<{
      name: string;
      protocolType: string;
      nameRange: { line: number; column: number; endLine: number; endColumn: number };
    }>;
  }

  return declarations
    .filter((declaration): declaration is Record<string, unknown> => Boolean(declaration))
    .filter(
      (declaration) =>
        declaration.kind === "protocol" &&
        typeof declaration.name === "string" &&
        typeof declaration.protocolType === "string" &&
        typeof declaration.nameRange === "object" &&
        declaration.nameRange !== null,
    )
    .map((declaration) => {
      const range = declaration.nameRange as Record<string, unknown>;
      return {
        name: declaration.name as string,
        protocolType: declaration.protocolType as string,
        nameRange: {
          line: toNumber(String(range.line ?? "1"), 1),
          column: toNumber(String(range.column ?? "1"), 1),
          endLine: toNumber(String(range.endLine ?? range.line ?? "1"), 1),
          endColumn: toNumber(String(range.endColumn ?? range.column ?? "1"), 1),
        },
      };
    });
};

export const runBirdcReadOnlyQuery = (
  query: string,
  command = BIRDC_DEFAULT_COMMAND,
): BirdcQueryResult => {
  const result = spawnSync("sh", ["-c", command], {
    encoding: "utf8",
    input: `${query}\nquit\n`,
  });

  if (result.error) {
    const message = createBirdcRunnerWarningMessage(result.error.message);
    return {
      command,
      query,
      exitCode: 1,
      stdout: "",
      stderr: message,
      diagnostics: [createWarningDiagnostic("birdc/runner-warning", message)],
    };
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? 1;

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
  const lines = stdout
    .split(/\r?\n/)
    .map(sanitizeBirdcLine)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  for (const lineText of lines) {
    const lowered = lineText.toLowerCase();
    if (
      lowered.startsWith("bird ") ||
      lowered.startsWith("name proto table state") ||
      lowered === "0000"
    ) {
      continue;
    }

    const columns = lineText.split(" ");
    if (columns.length < 4) {
      continue;
    }

    const [name, protocol, , state] = columns;
    if (!name || !protocol || !state) {
      continue;
    }

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
  const command = validateCommand.replaceAll("{file}", shellEscape(filePath));

  const result = spawnSync("sh", ["-c", command], {
    encoding: "utf8",
  });

  if (result.error) {
    const message = createBirdRunnerErrorMessage(result.error.message);
    return {
      command,
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

  const stderr = result.stderr ?? "";

  return {
    command,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
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
