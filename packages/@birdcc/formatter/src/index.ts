import { spawnSync } from "node:child_process";

export type FormatterEngine = "dprint" | "prettier" | "builtin";

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
): { ok: boolean; output: string } => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: text,
  });

  if (result.error || (result.status ?? 1) !== 0) {
    return { ok: false, output: text };
  }

  return {
    ok: true,
    output: result.stdout?.length ? result.stdout : text,
  };
};

const tryDprint = (text: string): string | null => {
  const result = runExternalFormatter("dprint", ["fmt", "--stdin", "bird.conf"], text);
  return result.ok ? result.output : null;
};

const tryPrettier = (text: string): string | null => {
  const result = runExternalFormatter("prettier", ["--stdin-filepath", "bird.conf"], text);
  return result.ok ? result.output : null;
};

export const formatBirdConfig = (
  text: string,
  options: FormatBirdConfigOptions = {},
): BirdFormatResult => {
  const requestedEngine = options.engine ?? "dprint";

  if (requestedEngine === "dprint") {
    const dprintOutput = tryDprint(text);
    if (dprintOutput !== null) {
      return {
        text: dprintOutput,
        changed: dprintOutput !== text,
        engine: "dprint",
      };
    }

    const prettierOutput = tryPrettier(text);
    if (prettierOutput !== null) {
      return {
        text: prettierOutput,
        changed: prettierOutput !== text,
        engine: "prettier",
      };
    }
  }

  if (requestedEngine === "prettier") {
    const prettierOutput = tryPrettier(text);
    if (prettierOutput !== null) {
      return {
        text: prettierOutput,
        changed: prettierOutput !== text,
        engine: "prettier",
      };
    }
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
