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

const FORMATTER_TIMEOUT_MS = 30_000;
const FORMATTER_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

const normalizeTextWithBuiltin = (text: string): string => {
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

  return formattedText;
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

  if (requestedEngine === "builtin") {
    const builtinOutput = normalizeTextWithBuiltin(text);
    return {
      text: builtinOutput,
      changed: builtinOutput !== text,
      engine: "builtin",
    };
  }

  const builtinOutput = normalizeTextWithBuiltin(text);
  return {
    text: builtinOutput,
    changed: builtinOutput !== text,
    engine: "builtin",
  };
};

export const checkBirdConfigFormat = (
  text: string,
  options: FormatBirdConfigOptions = {},
): BirdFormatCheckResult => ({
  changed: formatBirdConfig(text, options).changed,
});
