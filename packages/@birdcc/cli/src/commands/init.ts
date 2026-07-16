/**
 * `birdcc init` — detect project entry points and generate bird.config.json.
 */

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  selectAutoDetectedEntry,
  sniffProjectEntrypoints,
  type DetectionResult,
  type EntryCandidate,
} from "@birdcc/core";
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
const buildConfig = async (
  root: string,
  selectedEntry: EntryCandidate,
): Promise<Record<string, unknown>> => {
  const config: Record<string, unknown> = {
    $schema: SCHEMA_URL,
    main: `./${selectedEntry.path}`,
  };

  const indentResult = await detectIndentSizeFromFiles(root, [
    selectedEntry.path,
  ]);
  if (indentResult.indentSize !== undefined) {
    config.formatter = {
      indentSize: indentResult.indentSize,
    };
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

  const selectedEntry = selectAutoDetectedEntry(result);
  if (selectedEntry) {
    const config = await buildConfig(root, selectedEntry);
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
  const selectedEntry = selectAutoDetectedEntry(result);

  // JSON output mode
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));

    if (!options.dryRun && options.write && selectedEntry) {
      const config = await buildConfig(root, selectedEntry);
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
    if (!selectedEntry) {
      console.error(
        "Could not safely select a BIRD entry point. Review the candidates or configure main explicitly.",
      );
      process.exitCode = 1;
      return;
    }

    const config = await buildConfig(root, selectedEntry);
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
      `  Entry: ${selectedEntry.path} (${result.kind}, confidence: ${result.confidence}%)`,
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

  if (selectedEntry) {
    console.log(`\nRun with --write to create ${options.configName}`);
  }
};
