# Changelog

All notable changes to `@birdcc/cli` will be documented in this file.

## [0.1.0-beta.1] - 2026-05-02

### ✨ Added / 新增

- 🎨 **彩色终端输出** / **Colored terminal output**

  `lint` 诊断现在以彩色输出：错误为红色加粗、警告为黄色加粗、成功消息为绿色。基于 [yoctocolors](https://github.com/sindresorhus/yoctocolors) — 零依赖、最小体积的 CLI 着色库。

  Lint diagnostics are now colorized: errors in bold red, warnings in bold yellow, success messages in green. Powered by yoctocolors — the lightest zero-dependency CLI coloring library.

- 📋 **`-v` / `--verbose` 详细输出** / **Verbose flag**

  全局 `-v` / `--verbose` 标志，所有命令均支持。Lint 模式显示目标文件列表、每文件诊断数量、每文件耗时；Format 模式显示目标文件路径；Init 模式显示扫描目录。所有命令均输出总耗时。

  Global `-v` / `--verbose` flag supported across all commands. Lint mode shows target file listing, per-file diagnostic counts, and per-file timing; Format mode shows target path; Init mode shows scan directory. All commands report total elapsed time.

- 📝 **`lint --json` 简写** / **`--json` shorthand on lint**

  `birdcc lint --json` 等价于 `birdcc lint --format json`，与其他 CLI 工具保持一致。

  `birdcc lint --json` is now shorthand for `birdcc lint --format json`, consistent with other CLI tools.

- 📐 **`fmt --json` 结构化输出** / **Structured format output**

  `birdcc fmt --json` 输出 `{"changed": true/false, "filePath": "..."}` 格式的 JSON，方便 CI 流水线集成。

  `birdcc fmt --json` outputs JSON with `changed` status and `filePath`, suitable for CI pipeline integration.

- 🔍 **`--debug-json` 调试字段** / **Debug JSON fields**

  全局 `--debug-json` 标志为 JSON 输出追加调试字段：`configPath`、`targetFiles`、`elapsedMs`、`engine` 等。适合 IDE 集成和故障排查。

  Global `--debug-json` flag appends debug fields to JSON output: `configPath`, `targetFiles`, `elapsedMs`, `engine`, etc. Designed for IDE integration and troubleshooting.

- 🏷️ **TypeScript 类型导出** / **TypeScript type exports**

  新增 `@birdcc/cli/output-types` 和 `@birdcc/cli/output-schemas` 导出路径，分别提供 JSON 输出的 TypeScript 类型定义和 Zod 校验 Schema。外部工具可安全解析 birdcc 的 JSON 输出。

  New `@birdcc/cli/output-types` and `@birdcc/cli/output-schemas` export paths providing TypeScript type definitions and Zod validation schemas for all JSON output formats.

- 📊 **lint JSON 输出增强** / **Enriched lint JSON output**

  参考 oxlint JSON 格式，`--format json` 输出现在包含：`files`（文件数）、`rules`（规则数）、`errors`（错误数）、`warnings`（警告数）、`elapsedMs`（耗时）。每个诊断条目新增 `causes`、`related`、`labels`、`url`、`help` 预留字段。

  Following oxlint's JSON format, `--format json` output now includes `files`, `rules`, `errors`, `warnings`, and `elapsedMs` summary fields. Each diagnostic entry gains reserved fields: `causes`, `related`, `labels`, `url`, and `help`.

### 🐛 Fixed / 修复

- 🏠 **`birdcc init` 主入口误判** / **Entry-point misdetection**

  修复根目录 `bird.conf`（含 `router id` + `define` 但无 `protocol` 块）被错误归类为 `library` 的问题。该 bug 导致 `birdcc init` 选中子目录文件（如 `protocol/kernel.conf`）而非真正的 `bird.conf` 主入口。

  Fixed a bug where root-level `bird.conf` (with `router id` + `define` but no `protocol` blocks) was misclassified as `library`, causing `birdcc init` to pick a sub-file as primary instead of `bird.conf`.

- 🗂️ **`birdcc init` monorepo 根级入口丢失** / **Monorepo root entry omission**

  修复 monorepo 模式下 `buildConfig` 丢弃根级 entry 候选文件的问题。生成的 `bird.config.json` 现在正确同时设置 `main` 和 `workspaces`。

  Fixed `buildConfig` to include root-level entry candidates in monorepo mode. Generated `bird.config.json` now correctly sets both `main` and `workspaces`.

- 🚫 **非法 `--format` 值静默回退** / **Invalid --format silently fell back**

  `--format html` 等非法值过去静默回退到 `text` 输出，现在会抛出明确的错误提示。

  Invalid `--format` values (like `--format html`) previously fell back silently to `text` — now throw a clear error.

- 📁 **`fmt` 目录错误信息优化** / **Directory-friendly error in fmt**

  `birdcc fmt .` 过去报 `EISDIR: illegal operation on a directory`，现在提示 `'path' is a directory, not a file. Use a specific .conf file like 'bird.conf'.`。

  `birdcc fmt .` now shows a friendly "is a directory" message instead of raw EISDIR error.

- 💬 **I/O 错误信息优化** / **Friendly I/O error messages**

  `EISDIR`、`EACCES`、`ENOENT`、`ENOTDIR` 等 Node.js 错误码现在映射为人类可读的英文错误消息。

  Common Node.js errno codes (EISDIR, EACCES, ENOENT, ENOTDIR) are now mapped to human-readable messages.

### 🔧 Changed / 变更

- ⬆️ **依赖升级** / **Dependency upgrades**

  - `cac` 从 `^6.7.14` 升级至 `^7.0.0`（零依赖、纯 ESM、无 breaking change 影响本项目）
  - 新增 `yoctocolors` 用于彩色终端输出

  - `cac` upgraded from `^6.7.14` to `^7.0.0` (zero-dependency, pure ESM, no breaking changes for this project)
  - Added `yoctocolors` for terminal coloring

- ♻️ **代码重构** / **Code refactoring**

  从 `cli.ts` 提取工具函数至新建的 `cli-helpers.ts`，减少 CLI 入口文件 24% 代码量。抽象 `vlog()` / `vtime()` 函数消除重复的 verbose 日志模板。

  Extracted utility functions from `cli.ts` into new `cli-helpers.ts`, reducing the entry point by 24%. Abstracted `vlog()` / `vtime()` helpers to eliminate repetitive verbose-logging templates.
