import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { BirdDiagnostic } from "@birdcc/core";
import { startLspServer } from "@birdcc/lsp";
import { lintBirdConfig } from "@birdcc/linter";
import { createBirdRunnerErrorMessage } from "./messages.js";

export interface BirdValidateResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  diagnostics: BirdDiagnostic[];
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

const normalizeMessage = (message: string): string => message.replace(/^bird:\s*/i, "").trim();

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
}

export interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

export const runLint = (filePath: string, options: LintOptions = {}): BirdccLintOutput => {
  const text = readFileSync(filePath, "utf8");
  const lintResult = lintBirdConfig(text);
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

export const formatBirdConfigText = (text: string): FmtResult => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/g, ""));
  const compacted: string[] = [];

  let blankStreak = 0;
  for (const line of lines) {
    if (line.length === 0) {
      blankStreak += 1;
      if (blankStreak > 1) {
        continue;
      }
      compacted.push("");
      continue;
    }

    blankStreak = 0;
    compacted.push(line);
  }

  let formattedText = compacted.join("\n");
  if (!formattedText.endsWith("\n")) {
    formattedText += "\n";
  }

  return {
    changed: formattedText !== text,
    formattedText,
  };
};

export interface FmtOptions {
  write?: boolean;
}

export const runFmt = (filePath: string, options: FmtOptions = {}): FmtResult => {
  const text = readFileSync(filePath, "utf8");
  const result = formatBirdConfigText(text);

  if (options.write && result.changed) {
    writeFileSync(filePath, result.formattedText, "utf8");
  }

  return result;
};

export const runLspStdio = (): void => {
  startLspServer();
};
