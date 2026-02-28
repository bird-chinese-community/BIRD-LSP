#!/usr/bin/env node
import { runFmt, runLint, runLspStdio } from "./index.js";

const printHelp = (): void => {
  console.log(
    `birdcc commands:\n\n  birdcc lint <file> [--format json|text] [--bird] [--validate-command "bird -p -c {file}"]\n  birdcc fmt <file> [--check|--write]\n  birdcc lsp --stdio`,
  );
};

const parseArgs = (
  args: string[],
): {
  command: string | undefined;
  filePath: string | undefined;
  format: "json" | "text";
  withBird: boolean;
  validateCommand?: string;
  check: boolean;
  write: boolean;
  stdio: boolean;
} => {
  const [command, ...rest] = args;
  let filePath: string | undefined;
  let format: "json" | "text" = "text";
  let withBird = false;
  let validateCommand: string | undefined;
  let check = false;
  let write = false;
  let stdio = false;

  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (item === "--format") {
      const value = rest[i + 1];
      if (value === "json" || value === "text") {
        format = value;
      }
      i += 1;
      continue;
    }

    if (item === "--bird") {
      withBird = true;
      continue;
    }

    if (item === "--validate-command") {
      validateCommand = rest[i + 1];
      i += 1;
      continue;
    }

    if (item.startsWith("--validate-command=")) {
      validateCommand = item.slice("--validate-command=".length);
      continue;
    }

    if (item === "--check") {
      check = true;
      continue;
    }

    if (item === "--write") {
      write = true;
      continue;
    }

    if (item === "--stdio") {
      stdio = true;
      continue;
    }

    if (!item.startsWith("--") && !filePath) {
      filePath = item;
    }
  }

  return { command, filePath, format, withBird, validateCommand, check, write, stdio };
};

const runLintCommand = (parsed: ReturnType<typeof parseArgs>): void => {
  if (!parsed.filePath) {
    console.error("缺少配置文件路径");
    process.exit(1);
  }

  const result = runLint(parsed.filePath, {
    withBird: parsed.withBird,
    validateCommand: parsed.validateCommand,
  });

  if (parsed.format === "json") {
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
  process.exit(hasError ? 1 : 0);
};

const runFmtCommand = (parsed: ReturnType<typeof parseArgs>): void => {
  if (!parsed.filePath) {
    console.error("缺少配置文件路径");
    process.exit(1);
  }

  if (parsed.check && parsed.write) {
    console.error("不能同时使用 --check 与 --write");
    process.exit(1);
  }

  const writeMode = parsed.write;
  const result = runFmt(parsed.filePath, { write: writeMode });

  if (writeMode) {
    console.log(result.changed ? "已格式化文件" : "文件已是规范格式");
    process.exit(0);
  }

  if (result.changed) {
    console.error("格式检查失败，请执行 `birdcc fmt <file> --write`");
    process.exit(1);
  }

  console.log("格式检查通过");
  process.exit(0);
};

const runLspCommand = (parsed: ReturnType<typeof parseArgs>): void => {
  if (!parsed.stdio) {
    console.error("当前仅支持 `birdcc lsp --stdio`");
    process.exit(1);
  }

  runLspStdio();
};

const main = (): void => {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.command === "--help" || parsed.command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (parsed.command === "lint") {
    runLintCommand(parsed);
    return;
  }

  if (parsed.command === "fmt") {
    runFmtCommand(parsed);
    return;
  }

  if (parsed.command === "lsp") {
    runLspCommand(parsed);
    return;
  }

  printHelp();
  process.exit(1);
};

main();
