#!/usr/bin/env node
import { cac } from "cac";
import { runFmt, runLint, runLspStdio } from "./index.js";
import { CLI_MESSAGES } from "./messages.js";

interface LintOptions {
  format?: "json" | "text";
  bird?: boolean;
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

type FileAction<TOptions extends object> = (file: string, options: TOptions) => Promise<void>;
type CommandAction<TOptions extends object> = (options: TOptions) => Promise<void>;

const withActionErrorHandling = <TOptions extends object>(action: FileAction<TOptions>) => {
  return async (file: string, options: TOptions): Promise<void> => {
    try {
      await action(file, options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
};

const withCommandErrorHandling = <TOptions extends object>(action: CommandAction<TOptions>) => {
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
const FMT_ENGINE_SET = new Set(["dprint", "builtin"]);

cli
  .command("lint <file>", "Lint BIRD config file")
  .option("--format <format>", "Output format: json | text", {
    default: "text",
  })
  .option("--bird", "Run bird -p validation")
  .option("--validate-command <command>", "Validation command template")
  .action(
    withActionErrorHandling(async (file: string, options: LintOptions) => {
      const format = options.format === "json" ? "json" : "text";
      const result = await runLint(file, {
        withBird: Boolean(options.bird),
        validateCommand: options.validateCommand,
      });

      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.diagnostics.length === 0) {
          console.log(CLI_MESSAGES.lintNoDiagnostics);
        }

        for (const diagnostic of result.diagnostics) {
          console.log(
            `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.range.line}:${diagnostic.range.column} ${diagnostic.message}`,
          );
        }
      }

      const hasError = result.diagnostics.some((item) => item.severity === "error");
      if (hasError) {
        process.exitCode = 1;
      }
    }),
  );

cli
  .command("fmt <file>", "Format BIRD config file")
  .option("--check", "Only check formatting")
  .option("--write", "Write formatted output to file")
  .option("--engine <engine>", "Formatter engine: dprint | builtin")
  .action(
    withActionErrorHandling(async (file: string, options: FmtOptions) => {
      if (options.check && options.write) {
        console.error(CLI_MESSAGES.fmtCheckWriteConflict);
        process.exitCode = 1;
        return;
      }

      const engine = options.engine?.toLowerCase();
      if (engine && !FMT_ENGINE_SET.has(engine)) {
        console.error(CLI_MESSAGES.fmtInvalidEngine(engine));
        process.exitCode = 1;
        return;
      }

      const writeMode = Boolean(options.write);
      const result = await runFmt(file, {
        write: writeMode,
        engine: engine as "dprint" | "builtin" | undefined,
      });

      if (writeMode) {
        console.log(result.changed ? CLI_MESSAGES.fmtWritten : CLI_MESSAGES.fmtAlreadyFormatted);
        return;
      }

      if (result.changed) {
        console.error(CLI_MESSAGES.fmtCheckFailed);
        process.exitCode = 1;
        return;
      }

      console.log(CLI_MESSAGES.fmtCheckPassed);
    }),
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
