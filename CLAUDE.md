# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## base info

代码输出语言应该是 English, 但可以包含中文注释和文档字符串以提高可读性。

与我的对话应该使用 Chinese, 但代码注释和文档字符串可以使用 English 来提高国际化可读性。

你应该自行分析代码库结构和依赖关系，以便在修改或添加代码时能够正确地处理模块之间的关系。

MUST DO: 每次回答前都应该自行在 ./.agents/skills/INDEX.md 中查找相关技能/最佳实践，以便在需要时调用它们来完成特定任务。

MUST DO: 每个 PR 合并前都需要等待至少 180s 的时间，以便让 CI 系统和 Auto Reviewer 有足够的时间检测到潜在的问题。

## Project Overview

**BIRD-LSP** 是一个为 BIRD2（BIRD Internet Routing Daemon）配置文件提供 Language Server Protocol (LSP) 支持的工具链项目，包含语法高亮、诊断、格式化、代码补全等功能。

- **技术栈**: TypeScript + Tree-sitter + dprint + vscode-languageserver-node
- **架构**: Turborepo 管理的 monorepo
- **包管理器**: pnpm
- **测试框架**: Vitest

## Repository Structure

```
packages/
  @birdcc/parser/              # Tree-sitter grammar + WASM + JS adapter
  @birdcc/core/                # AST / Symbol Table / Type Checker / Cross-file resolution
  @birdcc/linter/              # Lint rules / Diagnostics (32+ rules)
  @birdcc/lsp/                 # LSP server implementation
  @birdcc/formatter/           # dprint plugin + builtin formatter
  @birdcc/dprint-plugin-bird/  # Official dprint plugin (Rust/WASM)
  @birdcc/cli/                 # birdcc CLI (lint/fmt/lsp commands)

refer/                         # Git submodules - reference materials
  BIRD-source-code/            # Official BIRD daemon C source
  BIRD-tm-language-grammar/    # Existing TextMate grammar
  BIRD2-vim-grammar/           # Vim syntax highlighting

.agents/skills/                # Claude Code skills for this project
```

## Common Commands

### Development

```bash
# Install dependencies
pnpm install

# Build all packages (depends on ^build, outputs to dist/)
pnpm build

# Run all tests (depends on build)
pnpm test

# Run tests for a specific package
pnpm --filter @birdcc/parser test

# Run single test file
pnpm vitest run packages/@birdcc/parser/src/index.test.ts

# Run tests in watch mode
pnpm vitest

# Type check all packages
pnpm typecheck

# Lint code (uses oxlint)
pnpm lint

# Format check (uses oxfmt)
pnpm format
```

### CLI Commands (after build)

CLI 入口位于 `packages/@birdcc/cli/dist/cli.js`:

```bash
# Lint BIRD2 config files
node packages/@birdcc/cli/dist/cli.js lint <file.conf> --format json

# Lint with BIRD validation
node packages/@birdcc/cli/dist/cli.js lint <file.conf> --bird

# Cross-file lint (default enabled)
node packages/@birdcc/cli/dist/cli.js lint <file.conf> --cross-file --include-max-depth 10

# Format check
node packages/@birdcc/cli/dist/cli.js fmt <file.conf> --check

# Format write
node packages/@birdcc/cli/dist/cli.js fmt <file.conf> --write

# Format with specific engine
node packages/@birdcc/cli/dist/cli.js fmt <file.conf> --write --engine dprint

# Start LSP server
node packages/@birdcc/cli/dist/cli.js lsp --stdio
```

### Turborepo Commands

```bash
# Run build for affected packages
turbo run build --affected

# Run tests with cache
turbo run test

# Force rebuild without cache
turbo run build --force
```

## Architecture

### 分层架构

```
Editors (VSCode/Neovim)
         |
         v
    @birdcc/lsp
 (diagnostics/hover/completion/definition/references/documentSymbol)
     |                      \
     v                       v
  @birdcc/linter        @birdcc/formatter
 (32+ Rules/Diagnostics)  (dprint + builtin)
     ^                       ^
     |                       |
  @birdcc/core  <-----------+
 (AST/Symbol/TypeChecker/CrossFile)
     ^
     |
  @birdcc/parser
 (tree-sitter + wasm adapter)
     |
     v
bird -p adapter（optional）
```

### 关键设计决策

1. **Parser**: Tree-sitter 负责语法解析，产出 CST/AST，支持错误恢复
2. **语义层**: `@birdcc/core` 负责符号表、类型检查、跨文件解析
3. **规则层**: `@birdcc/linter` 负责协议/安全/性能规则（32+ 条）
4. **Formatter**: dprint 插件为主，builtin 作为安全回退
5. **BIRD 集成**: 使用 `bird -p` 子进程验证，支持自定义验证命令模板
6. **跨文件**: 支持 `include` 展开、符号表合并、循环检测

### 双层语言模型

BIRD2 配置包含两个层次：

1. **配置声明层**: `protocol/template/filter/function` 结构
2. **Filter 表达式层**: 15+ 类型、控制流、运算符重载、方法调用

Tree-sitter 负责结构解析，类型语义交给 `@birdcc/core`，协议规则交给 `@birdcc/linter`。

## Git Submodules

项目依赖以下参考仓库：

```bash
# 初始化 submodules
git submodule update --init --recursive

# 更新 submodules
git submodule update --recursive --remote
```

- `refer/BIRD-source-code`: BIRD 官方源码，用于参考 parser 实现
- `refer/BIRD-tm-language-grammar`: 现有 TextMate 语法
- `refer/BIRD2-vim-grammar`: Vim 语法高亮

## Current Implementation Status

基于 TASKLIST.md 的执行进展:

- **M1** ✅: Tree-sitter grammar 已完成，支持多词短语识别（`local as`、`next hop self` 等）
- **M2** ✅: LSP 基础 + 错误恢复 + `bird -p` PoC 已完成
- **M3** ✅: Symbol/Type Checker + include 跨文件支持已完成
- **M4** 🚧: 协议规则完善 + dprint 稳定化 + 发布体系进行中

### 已完成功能

- ✅ `@birdcc/parser`: Tree-sitter + WASM，异步 API `parseBirdConfig(input) => Promise<ParsedBirdDocument>`
- ✅ `@birdcc/core`: 符号表、类型检查、跨文件解析（`resolveCrossFileReferences`）
- ✅ `@birdcc/linter`: 32+ 条规则（sym/cfg/net/type/bgp/ospf）
- ✅ `@birdcc/lsp`: LSP 服务器（diagnostics, hover, definition, references, completion, documentSymbol）
- ✅ `@birdcc/formatter`: dprint + builtin 双引擎，支持 safe mode
- ✅ `@birdcc/cli`: `birdcc lint/fmt/lsp` 已打通
- ✅ `bird -p` 诊断解析器（支持 `file:line:col` 与 `Parse error ..., line N:` 两类输出）

## Package Dependency Graph

```
@birdcc/parser (底层)
    ↑
@birdcc/core (依赖 parser)
    ↑
@birdcc/linter (依赖 core, parser)
    ↑
@birdcc/lsp (依赖 core, linter)

@birdcc/formatter (独立，依赖 parser)
@birdcc/dprint-plugin-bird (独立 dprint 插件)
@birdcc/cli (聚合入口，依赖 core, lsp, linter, formatter)
```

所有包使用 `type: "module"` (ESM) 和 `workspace:*` 协议进行内部依赖管理。

## Development Workflow

### 里程碑规划

| 阶段 | 周期    | 关键目标                                                     |
| ---- | ------- | ------------------------------------------------------------ |
| M1   | 4-5 周  | Tree-sitter grammar（配置 DSL 主干）+ fixtures               |
| M2   | 6-7 周  | LSP 基础能力 + 错误恢复处理器 + `bird -p` PoC                |
| M3   | 6-8 周  | Symbol/Type Checker 基础 + include 支持 + `bird -p` 稳定校验 |
| M4   | 8-10 周 | 协议规则完善 + dprint 稳定化 + 发布体系                      |

### Linter 规则分级

| 分类     | 默认级别 | CI 策略 |
| -------- | -------- | ------- |
| `sym/*`  | error    | 阻塞    |
| `cfg/*`  | error    | 阻塞    |
| `net/*`  | error    | 阻塞    |
| `type/*` | error    | 阻塞    |
| `bgp/*`  | warning  | 非阻塞  |
| `ospf/*` | warning  | 非阻塞  |

规则列表：

- **sym/\*** (7条): undefined, duplicate, proto-type-mismatch, filter-required, function-required, table-required, variable-scope
- **cfg/\*** (9条): no-protocol, missing-router-id, syntax-error, value-out-of-range, switch-value-expected, number-expected, incompatible-type, ip-network-mismatch, circular-template
- **net/\*** (4条): invalid-prefix-length, invalid-ipv4-prefix, invalid-ipv6-prefix, max-prefix-length
- **type/\*** (3条): mismatch, not-iterable, set-incompatible
- **bgp/\*** (5条): missing-local-as, missing-neighbor, missing-remote-as, as-mismatch, timer-invalid
- **ospf/\*** (4条): missing-area, backbone-stub, vlink-in-backbone, asbr-stub-area

## Tooling Stack

- **Linter**: [oxlint](https://oxc.rs/docs/guide/usage/linter.html) - 高性能 JavaScript/TypeScript linter
- **Formatter**: [oxfmt](https://oxc.rs/docs/guide/usage/linter.html) - 代码格式化工具
- **Test**: [Vitest](https://vitest.dev/) - 单元测试框架，配置在每个包的 `package.json` 中
- **Build**: TypeScript `tsc` - 每个包独立编译到 `dist/` 目录

## Configuration

项目配置位于 `birdcc.config.json`:

```json
{
  "$schema": "https://birdcc.link/schemas/birdcc-tooling.schema.json",
  "formatter": {
    "engine": "dprint",
    "indentSize": 2,
    "lineWidth": 100,
    "safeMode": true
  },
  "linter": {
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error",
      "bgp/*": "warning",
      "ospf/*": "warning"
    }
  },
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

配置支持通配符规则（如 `"sym/*": "error"`），按最长前缀匹配。

## LSP Server Capabilities

当前 LSP 服务器支持的能力：

- `textDocumentSync`: Incremental
- `documentSymbolProvider`: ✅
- `hoverProvider`: ✅
- `definitionProvider`: ✅
- `referencesProvider`: ✅
- `completionProvider`: ✅ (triggerCharacters: ` `, `.`)

## References

- `TASKLIST.md`: 详细的实施计划和技术选型报告
- `README.md`: 用户文档和项目介绍
- `.agents/skills/`: Claude Code skills for specialized tasks
  - `vscode-extension-builder/`: VS Code 扩展开发指南
  - `turborepo/`: Turborepo 最佳实践
  - `vitest/`: 测试指南
  - `typescript-e2e-testing/`: E2E 测试指南
  - `rust-engineer/`: Rust 开发指南（用于 dprint 插件）
