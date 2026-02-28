#!/usr/bin/env node
import { cac } from "cac";
import { runFmt, runLint, runLspStdio } from "./index.js";

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
        console.log("无诊断问题");
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
      console.error("不能同时使用 --check 与 --write");
      process.exitCode = 1;
      return;
    }

    const writeMode = Boolean(options.write);
    const result = runFmt(file, { write: writeMode });

    if (writeMode) {
      console.log(result.changed ? "已格式化文件" : "文件已是规范格式");
      return;
    }

    if (result.changed) {
      console.error("格式检查失败，请执行 `birdcc fmt <file> --write`");
      process.exitCode = 1;
      return;
    }

    console.log("格式检查通过");
  });

cli
  .command("lsp", "Run language server")
  .option("--stdio", "Use stdio transport")
  .action((options: LspOptions) => {
    if (!options.stdio) {
      console.error("当前仅支持 `birdcc lsp --stdio`");
      process.exitCode = 1;
      return;
    }

    runLspStdio();
  });

cli.help();

if (process.argv.length <= 2) {
  cli.outputHelp();
  process.exit(0);
}

cli.parse();
