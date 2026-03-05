import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { BirdDiagnosticSeverity } from "@birdcc/core";
import { z } from "zod";

const CONFIG_FILE_NAMES = ["bird.config.json", "birdcc.config.json"] as const;

const severitySchema = z.enum(["error", "warning", "info", "off"]);

const birdProjectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    main: z.string().optional(),
    workspaces: z.array(z.string()).optional(),
    roles: z
      .array(
        z
          .object({
            name: z.string(),
            vars: z.string(),
          })
          .strict(),
      )
      .optional(),
    includePaths: z.array(z.string()).optional(),
    crossFile: z
      .object({
        enabled: z.boolean().optional(),
        maxDepth: z.number().int().min(1).max(64).optional(),
        maxFiles: z.number().int().min(1).max(1024).optional(),
        externalIncludes: z.boolean().optional(),
      })
      .strict()
      .optional(),
    formatter: z
      .object({
        engine: z.enum(["dprint", "builtin"]).optional(),
        indentSize: z.number().int().min(1).max(16).optional(),
        lineWidth: z.number().int().min(20).max(1000).optional(),
        safeMode: z.boolean().optional(),
      })
      .strict()
      .optional(),
    linter: z
      .object({
        enabled: z.boolean().optional(),
        withBird: z.boolean().optional(),
        extends: z.array(z.string()).optional(),
        rules: z.record(z.string(), severitySchema).optional(),
      })
      .strict()
      .optional(),
    bird: z
      .object({
        version: z.string().optional(),
        binaryPath: z.string().optional(),
        validateCommand: z.string().min(1).optional(),
        socketPath: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export type LintRuleSeverity = z.infer<typeof severitySchema>;
export type BirdProjectConfig = z.infer<typeof birdProjectConfigSchema>;

export interface LoadedBirdProjectConfig {
  path?: string;
  config: BirdProjectConfig;
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    const ioError = error as NodeJS.ErrnoException;
    if (ioError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
};

const findConfigPath = async (
  targetFilePath: string,
): Promise<string | undefined> => {
  let current = resolve(dirname(targetFilePath));

  while (true) {
    for (const configFileName of CONFIG_FILE_NAMES) {
      const candidate = join(current, configFileName);
      if (await fileExists(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const createConfigError = (path: string, reason: string): Error =>
  new Error(`Invalid BIRD project config at ${path}: ${reason}`);

export const loadBirdProjectConfigForFile = async (
  targetFilePath: string,
): Promise<LoadedBirdProjectConfig> => {
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

  const validation = birdProjectConfigSchema.safeParse(parsed);
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
  rules?: Record<string, BirdDiagnosticSeverity | "off">,
): BirdDiagnosticSeverity | "off" | undefined => {
  if (!rules) {
    return undefined;
  }

  if (Object.hasOwn(rules, code)) {
    return rules[code];
  }

  let matched: BirdDiagnosticSeverity | "off" | undefined;
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
