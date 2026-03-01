import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { BirdDiagnosticSeverity } from "@birdcc/core";
import { z } from "zod";

const CONFIG_FILE_NAME = "birdcc.config.json";

const severitySchema = z.enum(["error", "warning", "info"]);

const birdccConfigSchema = z
  .object({
    $schema: z.string().optional(),
    formatter: z
      .object({
        engine: z.enum(["dprint", "builtin"]).optional(),
        indentSize: z.number().int().positive().optional(),
        lineWidth: z.number().int().positive().optional(),
        safeMode: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    linter: z
      .object({
        rules: z.record(z.string(), severitySchema).optional(),
      })
      .passthrough()
      .optional(),
    bird: z
      .object({
        validateCommand: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type BirdccConfig = z.infer<typeof birdccConfigSchema>;

export interface LoadedBirdccConfig {
  path?: string;
  config: BirdccConfig;
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const findConfigPath = async (targetFilePath: string): Promise<string | undefined> => {
  let current = resolve(dirname(targetFilePath));

  while (true) {
    const candidate = join(current, CONFIG_FILE_NAME);
    if (await fileExists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const createConfigError = (path: string, reason: string): Error =>
  new Error(`Invalid birdcc config at ${path}: ${reason}`);

export const loadBirdccConfigForFile = async (
  targetFilePath: string,
): Promise<LoadedBirdccConfig> => {
  const configPath = await findConfigPath(targetFilePath);
  if (!configPath) {
    return { config: {} };
  }

  const rawText = await readFile(configPath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw createConfigError(
      configPath,
      `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validation = birdccConfigSchema.safeParse(parsed);
  if (!validation.success) {
    const issueSummary = validation.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw createConfigError(configPath, issueSummary);
  }

  return {
    path: configPath,
    config: validation.data,
  };
};

export const resolveSeverityOverride = (
  code: string,
  rules?: Record<string, BirdDiagnosticSeverity>,
): BirdDiagnosticSeverity | undefined => {
  if (!rules) {
    return undefined;
  }

  if (rules[code]) {
    return rules[code];
  }

  let matched: BirdDiagnosticSeverity | undefined;
  let matchedPrefixLength = -1;

  for (const [pattern, severity] of Object.entries(rules)) {
    if (!pattern.endsWith("/*")) {
      continue;
    }

    const prefix = pattern.slice(0, -1);
    if (!code.startsWith(prefix)) {
      continue;
    }

    if (prefix.length > matchedPrefixLength) {
      matchedPrefixLength = prefix.length;
      matched = severity;
    }
  }

  return matched;
};
