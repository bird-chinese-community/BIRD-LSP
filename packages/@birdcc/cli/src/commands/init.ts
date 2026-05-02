/**
 * `birdcc init` — detect project entry points and generate bird.config.json.
 */

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sniffProjectEntrypoints, type DetectionResult } from "@birdcc/core";
import { detectIndentSizeFromFiles } from "./init-indent.js";

const SCHEMA_URL =
  "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json";

export interface InitOptions {
  configName: string;
  dryRun: boolean;
  write: boolean;
  force: boolean;
  json: boolean;
  maxDepth?: number;
  maxFiles?: number;
  ignore?: string[];
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if an existing config already has `main` or `workspaces` set.
 */
const existingConfigHasEntry = async (configPath: string): Promise<boolean> => {
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = JSON.parse(content);
    return Boolean(parsed.main || parsed.workspaces);
  } catch {
    return false;
  }
};

/**
 * Generate config object from detection result.
 */
const collectIndentProbePaths = (result: DetectionResult): string[] => {
  if (result.kind === "monorepo-multi-entry") {
    return result.candidates
      .filter(
        (candidate) =>
          candidate.role === "entry" || candidate.role === "unknown",
      )
      .slice(0, 5)
      .map((candidate) => candidate.path);
  }

  return result.primary ? [result.primary.path] : [];
};

const buildConfig = async (
  root: string,
  result: DetectionResult,
): Promise<Record<string, unknown>> => {
  const config: Record<string, unknown> = {
    $schema: SCHEMA_URL,
  };

  if (result.kind === "monorepo-multi-entry" && result.candidates.length > 0) {
    // Extract workspace directories from entry candidates
    const entryDirs = new Set<string>();
    for (const candidate of result.candidates) {
      if (candidate.role === "entry" || candidate.role === "unknown") {
        const dir = candidate.path.split("/").slice(0, -1).join("/");
        if (dir) {
          entryDirs.add(dir + "/");
        } else {
          // Root-level entry — include "." as a workspace dir
          entryDirs.add(".");
        }
      }
    }
    if (entryDirs.size > 0) {
      config.workspaces = [...entryDirs].sort();
    }
    // Also set main to the primary entry for clarity
    if (result.primary) {
      config.main = `./${result.primary.path}`;
    }
  } else if (result.primary) {
    config.main = `./${result.primary.path}`;
  }

  const indentProbePaths = collectIndentProbePaths(result);
  if (indentProbePaths.length > 0) {
    const indentResult = await detectIndentSizeFromFiles(
      root,
      indentProbePaths,
    );
    if (indentResult.indentSize !== undefined) {
      config.formatter = {
        indentSize: indentResult.indentSize,
      };
    }
  }

  return config;
};

/**
 * Format detection result for human-readable dry-run output.
 */
const formatDryRunOutput = async (
  root: string,
  result: DetectionResult,
): Promise<string> => {
  const lines: string[] = [];

  lines.push("Detected candidates:");
  for (const candidate of result.candidates.slice(0, 10)) {
    const signalSummary = candidate.signals.map((s) => s.name).join(", ");
    lines.push(
      `  ${candidate.path.padEnd(40)} score:${String(candidate.score).padStart(3)}  [${signalSummary}]`,
    );
  }
  if (result.candidates.length > 10) {
    lines.push(`  ... and ${result.candidates.length - 10} more`);
  }

  lines.push("");
  lines.push(`Conclusion: ${result.kind} (confidence: ${result.confidence}%)`);

  if (result.primary) {
    const config = await buildConfig(root, result);
    lines.push(`→ Will write: ${JSON.stringify(config)}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of result.warnings) {
      lines.push(`  [${w.code}] ${w.message}`);
    }
  }

  return lines.join("\n");
};

/**
 * Execute the `birdcc init` command.
 */
export const runInit = async (
  root: string,
  options: InitOptions,
): Promise<void> => {
  const configPath = join(root, options.configName);

  // Escape hatch: if config exists with main/workspaces, skip (unless --force)
  if (!options.force && (await fileExists(configPath))) {
    if (await existingConfigHasEntry(configPath)) {
      if (options.json) {
        console.log(
          JSON.stringify({
            skipped: true,
            reason: "Config already exists with entry configuration",
            configPath,
          }),
        );
      } else {
        console.log(
          `${options.configName} already exists with entry configuration. Use --force to overwrite.`,
        );
      }
      return;
    }
  }

  // Run detection
  const result = await sniffProjectEntrypoints(root, {
    maxDepth: options.maxDepth,
    maxFiles: options.maxFiles,
    exclude: options.ignore,
  });

  // JSON output mode
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));

    if (!options.dryRun && options.write && result.primary) {
      const config = await buildConfig(root, result);
      await writeFile(
        configPath,
        JSON.stringify(config, null, 2) + "\n",
        "utf8",
      );
    }
    return;
  }

  // Dry-run mode
  if (options.dryRun) {
    console.log(await formatDryRunOutput(root, result));
    return;
  }

  // Not-found
  if (result.kind === "not-found") {
    console.error(
      "No BIRD configuration entry point detected. Please create a bird.conf file or specify one manually.",
    );
    process.exitCode = 1;
    return;
  }

  // Write mode
  if (options.write || !process.stdout.isTTY) {
    if (!result.primary && result.kind !== "monorepo-multi-entry") {
      console.error("Could not determine a primary entry point.");
      process.exitCode = 1;
      return;
    }

    const config = await buildConfig(root, result);
    const configContent = JSON.stringify(config, null, 2) + "\n";

    if (!options.force && (await fileExists(configPath))) {
      console.error(
        `${options.configName} already exists. Use --force to overwrite.`,
      );
      process.exitCode = 1;
      return;
    }

    await writeFile(configPath, configContent, "utf8");
    console.log(`Created ${options.configName}`);
    console.log(
      `  Entry: ${result.primary?.path ?? "workspaces"} (${result.kind}, confidence: ${result.confidence}%)`,
    );
    return;
  }

  // Interactive TTY mode — show result and ask for confirmation
  console.log(await formatDryRunOutput(root, result));

  if (result.kind === "single-ambiguous") {
    console.log(
      "\nLow confidence — review the detection result before writing.",
    );
  }

  if (result.primary || result.kind === "monorepo-multi-entry") {
    console.log(`\nRun with --write to create ${options.configName}`);
  }
};
