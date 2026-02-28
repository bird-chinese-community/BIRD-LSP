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
}

interface LspOptions {
  stdio?: boolean;
}

const cli = cac("birdcc");

cli
  .command("lint <file>", "Lint BIRD config file")
  .option("--format <format>", "Output format: json | text", {
    default: "text",
  })
  .option("--bird", "Run bird -p validation")
  .option("--validate-command <command>", "Validation command template")
  .action((file: string, options: LintOptions) => {
    const format = options.format === "json" ? "json" : "text";
    const result = runLint(file, {
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
    process.exitCode = hasError ? 1 : 0;
  });

cli
  .command("fmt <file>", "Format BIRD config file")
  .option("--check", "Only check formatting")
  .option("--write", "Write formatted output to file")
  .action((file: string, options: FmtOptions) => {
    if (options.check && options.write) {
      console.error(CLI_MESSAGES.fmtCheckWriteConflict);
      process.exitCode = 1;
      return;
    }

    const writeMode = Boolean(options.write);
    const result = runFmt(file, { write: writeMode });

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
  });

cli
  .command("lsp", "Run language server")
  .option("--stdio", "Use stdio transport")
  .action((options: LspOptions) => {
    if (!options.stdio) {
      console.error(CLI_MESSAGES.lspRequiresStdio);
      process.exitCode = 1;
      return;
    }

    runLspStdio();
  });

cli.help();
cli.parse();
