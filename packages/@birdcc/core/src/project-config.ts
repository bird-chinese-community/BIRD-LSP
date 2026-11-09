import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { BirdDiagnostic, BirdDiagnosticSeverity } from "./types.js";
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
} from "./cross-file.js";

const CONFIG_FILE_NAMES = ["bird.config.json", "birdcc.config.json"] as const;
const severitySchema = z.enum(["error", "warning", "info", "off"]);

export const birdProjectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    main: z.string().optional(),
    workspaces: z.array(z.string()).optional(),
    roles: z
      .array(z.object({ name: z.string(), vars: z.string() }).strict())
      .optional(),
    includePaths: z.array(z.string()).optional(),
    crossFile: z
      .object({
        enabled: z.boolean().optional(),
        maxDepth: z.number().int().min(1).max(64).optional(),
        maxFiles: z.number().int().min(1).max(1024).optional(),
        maxDocumentBytes: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
        maxTotalBytes: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
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
        useTabs: z.boolean().optional(),
      })
      .strict()
      .optional(),
    linter: z
      .object({
        enabled: z.boolean().optional(),
        withBird: z.boolean().optional(),
        // Reserved for rule presets; accepted for compatibility but not applied.
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
export const birdEditorSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    performance: z
      .object({
        maxFileSizeBytes: z
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
      })
      .optional(),
    intel: z
      .object({
        enabled: z.boolean().optional(),
        inlayHints: z.boolean().optional(),
        completion: z.boolean().optional(),
        hover: z.boolean().optional(),
        dn42: z.object({ enabled: z.boolean().optional() }).optional(),
      })
      .optional(),
    formatter: birdProjectConfigSchema.shape.formatter,
    typeHints: z
      .object({
        enabled: z.boolean().optional(),
        inlay: z.object({ enabled: z.boolean().optional() }).optional(),
      })
      .optional(),
  })
  .passthrough();
export type BirdEditorSettings = z.infer<typeof birdEditorSettingsSchema>;
export const resolveAnalysisBudget = (
  config?: BirdProjectConfig["crossFile"],
  resourceMaxFileSizeBytes?: number,
) => {
  const maxDocumentBytes =
    config?.maxDocumentBytes ??
    resourceMaxFileSizeBytes ??
    DEFAULT_MAX_DOCUMENT_BYTES;
  return {
    maxDocumentBytes: Math.min(
      maxDocumentBytes,
      resourceMaxFileSizeBytes ?? maxDocumentBytes,
    ),
    maxTotalBytes: config?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  };
};
export interface LoadedBirdProjectConfig {
  path?: string;
  config: BirdProjectConfig;
}

const createConfigError = (configPath: string, reason: string): Error =>
  Object.assign(
    new Error(`Invalid BIRD project config at ${configPath}: ${reason}`),
    { configPath },
  );

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw createConfigError(
      path,
      error instanceof Error ? error.message : String(error),
    );
  }
};

export const loadBirdProjectConfigForFile = async (
  targetFilePath: string,
): Promise<LoadedBirdProjectConfig> => {
  let current = resolve(dirname(targetFilePath));
  let configPath: string | undefined;
  while (!configPath) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(current, name);
      if (await fileExists(candidate)) {
        configPath = candidate;
        break;
      }
    }
    if (configPath) break;
    const parent = dirname(current);
    if (parent === current) return { config: {} };
    current = parent;
  }
  let rawText: string;
  try {
    rawText = await readFile(configPath, "utf8");
  } catch (error) {
    throw createConfigError(
      configPath,
      `Read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
    throw createConfigError(
      configPath,
      validation.error.issues
        .map(
          (issue) =>
            `${issue.path.length ? issue.path.join(".") : "<root>"}: ${issue.message}`,
        )
        .join("; "),
    );
  }
  return { path: configPath, config: validation.data };
};

export const resolveSeverityOverride = (
  code: string,
  rules?: Record<string, BirdDiagnosticSeverity | "off">,
): BirdDiagnosticSeverity | "off" | undefined => {
  if (!rules) return undefined;
  if (Object.hasOwn(rules, code)) return rules[code];
  let matched: BirdDiagnosticSeverity | "off" | undefined;
  let longest = -1;
  for (const [pattern, severity] of Object.entries(rules)) {
    if (!pattern.endsWith("/*")) continue;
    const prefix = pattern.slice(0, -1);
    if (code.startsWith(prefix) && prefix.length > longest) {
      matched = severity;
      longest = prefix.length;
    }
  }
  return matched;
};

export const applyLintConfiguration = (
  diagnostics: readonly BirdDiagnostic[],
  config: BirdProjectConfig["linter"],
): BirdDiagnostic[] => {
  if (config?.enabled === false) return [];
  return diagnostics.flatMap((diagnostic) => {
    const severity = resolveSeverityOverride(diagnostic.code, config?.rules);
    return severity === "off"
      ? []
      : [{ ...diagnostic, severity: severity ?? diagnostic.severity }];
  });
};
