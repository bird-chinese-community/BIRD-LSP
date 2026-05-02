#!/usr/bin/env node
import { cac } from "cac";
import { dirname, resolve } from "node:path";
import { loadBirdProjectConfigForFile } from "./config.js";
import { runFmt, runLint, runLspStdio } from "./index.js";
import { runInit } from "./commands/init.js";
import { resolveWorkspaceEntries } from "./workspace-patterns.js";
import {
  CLI_MESSAGES,
  boldSeverity,
  createInvalidFormatOptionMessage,
  severityColor,
  vlog,
  vtime,
} from "./messages.js";
import {
  isCliFormatterEngine,
  parseOptionalPositiveInteger,
  resolveTargetFilePath,
  withActionErrorHandling,
  withCommandErrorHandling,
  type CliFormatterEngine,
} from "./cli-helpers.js";

interface LintOptions {
  format?: string;
  json?: boolean;
  debugJson?: boolean;
  verbose?: boolean;
  bird?: boolean;
  crossFile?: boolean;
  includeMaxDepth?: string;
  includeMaxFiles?: string;
  validateCommand?: string;
}

interface FmtOptions {
  check?: boolean;
  write?: boolean;
  json?: boolean;
  debugJson?: boolean;
  engine?: string;
  verbose?: boolean;
}

interface LspOptions {
  stdio?: boolean;
  verbose?: boolean;
}

const cli = cac("birdcc");
cli.option("--verbose, -v", "Enable verbose output");
cli.option("--debug-json", "Include debug-level fields in JSON output");

cli
  .command("lint [file]", "Lint BIRD config file")
  .option("--format <format>", "Output format: json | text", {
    default: "text",
  })
  .option(
    "--json",
    "Output diagnostics in JSON format (shorthand for --format json)",
  )
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
        const lintStartTime = Date.now();

        // Resolve format: --json flag overrides --format option
        const rawFormat = options.json ? "json" : (options.format ?? "text");
        if (rawFormat !== "json" && rawFormat !== "text") {
          throw new Error(createInvalidFormatOptionMessage(rawFormat));
        }
        const format = rawFormat;

        if (options.verbose) vlog("Resolving targets...");

        const includeMaxDepth = parseOptionalPositiveInteger(
          "--include-max-depth",
          options.includeMaxDepth,
        );
        const includeMaxFiles = parseOptionalPositiveInteger(
          "--include-max-files",
          options.includeMaxFiles,
        );

        // Resolve target files: single file OR workspace entries
        let targetFiles: string[];
        let loadedConfig;

        if (file) {
          const targetFilePath = resolve(file);
          loadedConfig = await loadBirdProjectConfigForFile(targetFilePath);
          targetFiles = [targetFilePath];
        } else {
          const fallbackEntry = resolve(process.cwd(), "bird.conf");
          loadedConfig = await loadBirdProjectConfigForFile(fallbackEntry);

          if (!loadedConfig.path) {
            throw new Error(
              "No target file specified and no bird.config.json found. Pass <file> explicitly or create bird.config.json with 'main'.",
            );
          }

          const configDir = dirname(loadedConfig.path);

          if ((loadedConfig.config.workspaces?.length ?? 0) > 0) {
            // Workspace mode: iterate all workspace entries
            targetFiles = await resolveWorkspaceEntries(
              configDir,
              loadedConfig.config.workspaces!,
            );
            if (targetFiles.length === 0) {
              throw new Error(
                "bird.config.json defines 'workspaces' but no matching workspace directories were found.",
              );
            }
          } else {
            const entry = loadedConfig.config.main ?? "bird.conf";
            targetFiles = [resolve(configDir, entry)];
          }
        }

        const configDir = loadedConfig.path
          ? dirname(loadedConfig.path)
          : undefined;
        const resolvedIncludePaths = (
          loadedConfig.config.includePaths ?? []
        ).map((pathValue) =>
          resolve(configDir ?? dirname(resolve(targetFiles[0])), pathValue),
        );
        const validateCommand =
          options.validateCommand ??
          loadedConfig.config.bird?.validateCommand ??
          (loadedConfig.config.bird?.binaryPath
            ? `${loadedConfig.config.bird.binaryPath} -p -c {file}`
            : undefined);

        // Run lint on all target files and aggregate
        const allDiagnostics: Array<import("@birdcc/core").BirdDiagnostic> = [];

        if (options.verbose) {
          vlog(
            `Linting ${targetFiles.length} file(s):`,
            ...targetFiles.map((tf) => `  ${tf}`),
          );
        }

        for (const targetFilePath of targetFiles) {
          const fileStartTime = options.verbose ? Date.now() : 0;

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
          allDiagnostics.push(...result.diagnostics);

          if (options.verbose) {
            const diagCount = result.diagnostics.length;
            const elapsed = Date.now() - fileStartTime;
            vlog(
              `  ${targetFilePath}: ${diagCount} diagnostic(s) in ${elapsed}ms`,
            );
          }
        }

        if (format === "json") {
          const errors = allDiagnostics.filter(
            (d) => d.severity === "error",
          ).length;
          const warnings = allDiagnostics.filter(
            (d) => d.severity === "warning",
          ).length;
          const output: Record<string, unknown> = {
            diagnostics: allDiagnostics.map((d) => ({
              ...d,
              causes: [],
              related: [],
              labels: [],
              url:
                d.code && d.code.includes("/")
                  ? `https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/rules/${d.code}.md`
                  : undefined,
              help: d.message,
            })),
            files: targetFiles.length,
            rules: Object.keys(loadedConfig.config.linter?.rules ?? {}).length,
            errors,
            warnings,
            elapsedMs: Date.now() - lintStartTime,
          };
          if (options.debugJson) {
            output.debug = {
              configPath: loadedConfig.path,
              targetFiles,
              includeMaxDepth,
              includeMaxFiles,
              validateCommand,
            };
          }
          console.log(JSON.stringify(output, null, format === "json" ? 2 : 0));
        } else {
          if (allDiagnostics.length === 0) {
            console.log(CLI_MESSAGES.lintNoDiagnostics);
          }

          for (const diagnostic of allDiagnostics) {
            const uriPrefix = diagnostic.uri ? `[${diagnostic.uri}] ` : "";
            const sev = boldSeverity(diagnostic.severity);
            const msg = severityColor(diagnostic.severity, diagnostic.message);
            console.log(
              `${sev} ${diagnostic.code} ${uriPrefix}${diagnostic.range.line}:${diagnostic.range.column} ${msg}`,
            );
          }
        }

        if (options.verbose) vtime("Lint", Date.now() - lintStartTime);

        const hasError = allDiagnostics.some(
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
  .option("--json", "Output format result as JSON")
  .action(
    withActionErrorHandling(
      async (file: string | undefined, options: FmtOptions) => {
        const fmtStartTime = Date.now();

        const targetFilePath = await resolveTargetFilePath(file);

        if (options.verbose) vlog(`Formatting ${targetFilePath}`);

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

        // JSON output
        if (options.json) {
          const jsonOutput: Record<string, unknown> = {
            changed: result.changed,
            filePath: targetFilePath,
          };
          if (options.debugJson) {
            jsonOutput.elapsedMs = Date.now() - fmtStartTime;
            jsonOutput.engine = engine ?? "default";
            if (loadedConfig.config.formatter?.indentSize)
              jsonOutput.indentSize = loadedConfig.config.formatter.indentSize;
            if (loadedConfig.config.formatter?.lineWidth)
              jsonOutput.lineWidth = loadedConfig.config.formatter.lineWidth;
          }
          console.log(JSON.stringify(jsonOutput, null, 2));
          return;
        }

        const logFmtTime = () => {
          if (options.verbose) vtime("Format", Date.now() - fmtStartTime);
        };

        if (writeMode) {
          console.log(
            result.changed
              ? CLI_MESSAGES.fmtWritten
              : CLI_MESSAGES.fmtAlreadyFormatted,
          );
          logFmtTime();
          return;
        }

        if (result.changed) {
          console.error(CLI_MESSAGES.fmtCheckFailed);
          process.exitCode = 1;
          logFmtTime();
          return;
        }

        console.log(CLI_MESSAGES.fmtCheckPassed);
        logFmtTime();
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

      if (options.verbose) vlog("Starting LSP server over stdio...");

      await runLspStdio();
    }),
  );

cli
  .command("init [root]", "Detect project entry and generate bird.config.json")
  .option(
    "--config-name <name>",
    "Config file name (bird.config.json | birdcc.config.json)",
    { default: "bird.config.json" },
  )
  .option("--dry-run", "Only show detection result, don't write file")
  .option("--write", "Write config file (default in non-TTY mode)")
  .option("--force", "Overwrite existing config")
  .option("--json", "Machine-readable JSON output")
  .option("--max-depth <n>", "Scan depth limit")
  .option("--max-files <n>", "File count limit")
  .option(
    "--ignore <patterns>",
    "Additional ignore glob patterns (comma-separated)",
  )
  .action(
    withActionErrorHandling(
      async (root: string | undefined, options: Record<string, unknown>) => {
        const initStartTime = Date.now();
        const isVerbose = Boolean(options.verbose);

        const resolvedRoot = resolve(root ?? process.cwd());
        const configName = (options.configName as string) ?? "bird.config.json";

        if (isVerbose)
          vlog(`Scanning ${resolvedRoot} for BIRD config files...`);
        const maxDepth = parseOptionalPositiveInteger(
          "--max-depth",
          options.maxDepth as string | undefined,
        );
        const maxFiles = parseOptionalPositiveInteger(
          "--max-files",
          options.maxFiles as string | undefined,
        );
        const ignoreRaw = options.ignore as string | undefined;
        const ignore = ignoreRaw
          ? ignoreRaw.split(",").map((s) => s.trim())
          : undefined;

        await runInit(resolvedRoot, {
          configName,
          dryRun: Boolean(options.dryRun),
          write: Boolean(options.write),
          force: Boolean(options.force),
          json: Boolean(options.json),
          maxDepth,
          maxFiles,
          ignore,
        });

        if (isVerbose) vtime("Init", Date.now() - initStartTime);
      },
    ),
  );

cli.help();
cli.parse();
