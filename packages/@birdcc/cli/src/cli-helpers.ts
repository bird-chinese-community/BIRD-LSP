/**
 * CLI helpers — pure utilities extracted from cli.ts to keep the entry point lean.
 */

import { dirname, resolve } from "node:path";
import { loadBirdProjectConfigForFile } from "./config.js";
import { createInvalidPositiveIntegerOptionMessage } from "./messages.js";

// ── types ──────────────────────────────────────────────────────────

export type FileAction<TOptions extends object> = (
  file: string | undefined,
  options: TOptions,
) => Promise<void>;

export type CommandAction<TOptions extends object> = (
  options: TOptions,
) => Promise<void>;

// ── error handling wrappers ────────────────────────────────────────

export const withActionErrorHandling = <TOptions extends object>(
  action: FileAction<TOptions>,
) => {
  return async (file: string | undefined, options: TOptions): Promise<void> => {
    try {
      await action(file, options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
};

export const withCommandErrorHandling = <TOptions extends object>(
  action: CommandAction<TOptions>,
) => {
  return async (options: TOptions): Promise<void> => {
    try {
      await action(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
};

// ── path resolution ────────────────────────────────────────────────

export const resolveTargetFilePath = async (
  file: string | undefined,
): Promise<string> => {
  if (file) {
    return resolve(file);
  }

  const fallbackEntry = resolve(process.cwd(), "bird.conf");
  const loadedConfig = await loadBirdProjectConfigForFile(fallbackEntry);
  if (!loadedConfig.path) {
    throw new Error(
      "No target file specified and no bird.config.json found. Pass <file> explicitly or create bird.config.json with 'main'.",
    );
  }

  if ((loadedConfig.config.workspaces?.length ?? 0) > 0) {
    throw new Error(
      "bird.config.json defines 'workspaces'. Please pass a concrete <file> path for lint/fmt.",
    );
  }

  const configDir = dirname(loadedConfig.path);
  const entry = loadedConfig.config.main ?? "bird.conf";
  return resolve(configDir, entry);
};

// ── option parsing ─────────────────────────────────────────────────

export const FMT_ENGINES = ["dprint", "builtin"] as const;
export type CliFormatterEngine = (typeof FMT_ENGINES)[number];

const FMT_ENGINE_SET = new Set<string>(FMT_ENGINES);

export const isCliFormatterEngine = (
  value: string,
): value is CliFormatterEngine => FMT_ENGINE_SET.has(value);

export const parseOptionalPositiveInteger = (
  optionName: string,
  rawValue: string | undefined,
): number | undefined => {
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      createInvalidPositiveIntegerOptionMessage(optionName, rawValue),
    );
  }

  return parsed;
};
