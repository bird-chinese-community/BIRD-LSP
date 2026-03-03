#!/usr/bin/env node
import { cac } from "cac";
import { dirname, resolve } from "node:path";
import { loadBirdProjectConfigForFile } from "./config.js";
import { runFmt, runLint, runLspStdio } from "./index.js";
import {
  CLI_MESSAGES,
  createInvalidPositiveIntegerOptionMessage,
} from "./messages.js";

interface LintOptions {
  format?: "json" | "text";
  bird?: boolean;
  crossFile?: boolean;
  includeMaxDepth?: string;
  includeMaxFiles?: string;
  validateCommand?: string;
}

interface FmtOptions {
  check?: boolean;
  write?: boolean;
  engine?: string;
}

interface LspOptions {
  stdio?: boolean;
}

type FileAction<TOptions extends object> = (
  file: string | undefined,
  options: TOptions,
) => Promise<void>;
type CommandAction<TOptions extends object> = (
  options: TOptions,
) => Promise<void>;

const withActionErrorHandling = <TOptions extends object>(
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

const resolveTargetFilePath = async (
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

const withCommandErrorHandling = <TOptions extends object>(
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

const cli = cac("birdcc");
const FMT_ENGINES = ["dprint", "builtin"] as const;
type CliFormatterEngine = (typeof FMT_ENGINES)[number];
const FMT_ENGINE_SET = new Set<string>(FMT_ENGINES);
const isCliFormatterEngine = (value: string): value is CliFormatterEngine =>
  FMT_ENGINE_SET.has(value);

const parseOptionalPositiveInteger = (
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

cli
  .command("lint [file]", "Lint BIRD config file")
  .option("--format <format>", "Output format: json | text", {
    default: "text",
  })
  .option("--bird", "Run bird -p validation")
  .option("--cross-file", "Enable cross-file include analysis", {
    default: true,
  })
  .option("--include-max-depth <n>", "Max include expansion depth")
  .option(
    "--include-max-files <n>",
    "Max number of files for include expansion",
  )
  .option("--validate-command <command>", "Validation command template")
  .action(
    withActionErrorHandling(
      async (file: string | undefined, options: LintOptions) => {
        const targetFilePath = await resolveTargetFilePath(file);
        const loadedConfig = await loadBirdProjectConfigForFile(targetFilePath);
        const configDir = loadedConfig.path
          ? dirname(loadedConfig.path)
          : undefined;
        const format = options.format === "json" ? "json" : "text";
        const includeMaxDepth = parseOptionalPositiveInteger(
          "--include-max-depth",
          options.includeMaxDepth,
        );
        const includeMaxFiles = parseOptionalPositiveInteger(
          "--include-max-files",
          options.includeMaxFiles,
        );
        const resolvedIncludePaths = (
          loadedConfig.config.includePaths ?? []
        ).map((pathValue) =>
          resolve(configDir ?? dirname(resolve(targetFilePath)), pathValue),
        );
        const validateCommand =
          options.validateCommand ??
          loadedConfig.config.bird?.validateCommand ??
          (loadedConfig.config.bird?.binaryPath
            ? `${loadedConfig.config.bird.binaryPath} -p -c {file}`
            : undefined);
        const result = await runLint(targetFilePath, {
          withBird: Boolean(
            options.bird || loadedConfig.config.linter?.withBird,
          ),
          crossFile:
            options.crossFile !== false &&
            loadedConfig.config.crossFile?.enabled !== false,
          includeMaxDepth:
            includeMaxDepth ?? loadedConfig.config.crossFile?.maxDepth,
          includeMaxFiles:
            includeMaxFiles ?? loadedConfig.config.crossFile?.maxFiles,
          includePaths: resolvedIncludePaths,
          allowIncludeOutsideWorkspace:
            loadedConfig.config.crossFile?.externalIncludes,
          linterEnabled: loadedConfig.config.linter?.enabled,
          validateCommand,
          severityOverrides: loadedConfig.config.linter?.rules,
        });

        if (format === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.diagnostics.length === 0) {
            console.log(CLI_MESSAGES.lintNoDiagnostics);
          }

          for (const diagnostic of result.diagnostics) {
            const uriPrefix = diagnostic.uri ? `[${diagnostic.uri}] ` : "";
            console.log(
              `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${uriPrefix}${diagnostic.range.line}:${diagnostic.range.column} ${diagnostic.message}`,
            );
          }
        }

        const hasError = result.diagnostics.some(
          (item) => item.severity === "error",
        );
        if (hasError) {
          process.exitCode = 1;
        }
      },
    ),
  );

cli
  .command("fmt [file]", "Format BIRD config file")
  .option("--check", "Only check formatting")
  .option("--write", "Write formatted output to file")
  .option("--engine <engine>", "Formatter engine: dprint | builtin")
  .action(
    withActionErrorHandling(
      async (file: string | undefined, options: FmtOptions) => {
        const targetFilePath = await resolveTargetFilePath(file);
        const loadedConfig = await loadBirdProjectConfigForFile(targetFilePath);
        if (options.check && options.write) {
          console.error(CLI_MESSAGES.fmtCheckWriteConflict);
          process.exitCode = 1;
          return;
        }

        const configuredEngine = loadedConfig.config.formatter?.engine;
        let engine: CliFormatterEngine | undefined = configuredEngine;
        if (options.engine) {
          const normalizedEngine = options.engine.toLowerCase();
          if (!isCliFormatterEngine(normalizedEngine)) {
            console.error(CLI_MESSAGES.fmtInvalidEngine(normalizedEngine));
            process.exitCode = 1;
            return;
          }
          engine = normalizedEngine;
        }

        const writeMode = Boolean(options.write);
        const result = await runFmt(targetFilePath, {
          write: writeMode,
          engine,
          indentSize: loadedConfig.config.formatter?.indentSize,
          lineWidth: loadedConfig.config.formatter?.lineWidth,
          safeMode: loadedConfig.config.formatter?.safeMode,
        });

        if (writeMode) {
          console.log(
            result.changed
              ? CLI_MESSAGES.fmtWritten
              : CLI_MESSAGES.fmtAlreadyFormatted,
          );
          return;
        }

        if (result.changed) {
          console.error(CLI_MESSAGES.fmtCheckFailed);
          process.exitCode = 1;
          return;
        }

        console.log(CLI_MESSAGES.fmtCheckPassed);
      },
    ),
  );

cli
  .command("lsp", "Run language server")
  .option("--stdio", "Use stdio transport")
  .action(
    withCommandErrorHandling(async (options: LspOptions) => {
      if (!options.stdio) {
        console.error(CLI_MESSAGES.lspRequiresStdio);
        process.exitCode = 1;
        return;
      }

      await runLspStdio();
    }),
  );

cli.help();
cli.parse();
