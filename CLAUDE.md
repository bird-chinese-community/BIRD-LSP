# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## base info

代码输出语言应该是 English, 但可以包含中文注释和文档字符串以提高可读性。

与我的对话应该使用 Chinese, 但代码注释和文档字符串可以使用 English 来提高国际化可读性。

## Project Overview

**BIRD-LSP** 是一个为 BIRD2（BIRD Internet Routing Daemon）配置文件提供 Language Server Protocol (LSP) 支持的工具链项目，包含语法高亮、诊断、格式化、代码补全等功能。

- **技术栈**: TypeScript + Tree-sitter + dprint + vscode-languageserver-node
- **架构**: Turborepo 管理的 monorepo
- **包管理器**: pnpm
- **测试框架**: Vitest

## Repository Structure

```
packages/
  @birdcc/parser/      # Tree-sitter grammar + WASM + JS adapter
  @birdcc/core/        # AST / Symbol Table / Type Checker
  @birdcc/linter/      # Lint rules / Diagnostics
  @birdcc/lsp/         # LSP server implementation
  @birdcc/formatter/   # dprint plugin for formatting
  @birdcc/cli/         # birdcc CLI (lint/fmt/lsp commands)

refer/                 # Git submodules - reference materials
  BIRD-source-code/    # Official BIRD daemon C source
  BIRD-tm-language-grammar/  # Existing TextMate grammar
  BIRD2-vim-grammar/   # Vim syntax highlighting

.agents/skills/        # Claude Code skills for this project
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
node packages/@birdcc/cli/dist/cli.js lint <file.conf> --format json --max-warnings 0

# Format check
node packages/@birdcc/cli/dist/cli.js fmt <file.conf> --check

# Format write
node packages/@birdcc/cli/dist/cli.js fmt <file.conf> --write

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
 (diagnostics/hover/completion)
     |                      \
     v                       v
  @birdcc/linter        @birdcc/formatter
 (Rules/Diagnostics)      (dprint plugin)
     ^                       ^
     |                       |
  @birdcc/core  <-----------+
(AST/Symbol/TypeChecker)
     ^
     |
  @birdcc/parser
(tree-sitter + wasm adapter)
     |
     v
bird -p / birdc adapter
```

### 关键设计决策

1. **Parser**: Tree-sitter 负责语法解析，产出 CST/AST
2. **语义层**: `@birdcc/core` 负责符号表、类型检查
3. **规则层**: `@birdcc/linter` 负责协议/安全/性能规则
4. **Formatter**: dprint 插件为主，Prettier 仅作兼容层
5. **BIRD 集成**: MVP 使用 `bird -p` 子进程验证，后续考虑 `birdc`

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

- **M1 进行中**: Tree-sitter grammar 原型已完成，支持多词短语识别（`local as`、`next hop self` 等）
- **Parser**: 配置 DSL 主干声明解析已接入（`include/define/protocol/template/filter/function`）
- **CLI**: `birdcc lint/fmt/lsp --stdio` 已打通，`lsp --stdio` 可启动最小诊断服务
- **BIRD 集成**: `bird -p` 诊断解析器已实现（支持 `file:line:col` 与 `Parse error ..., line N:` 两类输出）
- **Fixtures**: `sample/*.conf` 已接入 parser 测试覆盖

## Package Dependency Graph

```
@birdcc/parser (底层)
    ↑
@birdcc/core (依赖 parser)
    ↑
@birdcc/linter (依赖 core, parser)
    ↑
@birdcc/lsp (依赖 core, linter)

@birdcc/cli (聚合入口，依赖 core, lsp, linter)
```

所有包使用 `type: "module"` (ESM) 和 `workspace:*` 协议进行内部依赖管理。

## Development Workflow

### 里程碑规划

- **M1** (4-5 周): Tree-sitter grammar + fixtures
- **M2** (6-7 周): LSP 基础 + 错误恢复 + `bird -p` PoC
- **M3** (6-8 周): Symbol/Type Checker + include 支持
- **M4** (8-10 周): 协议规则 + dprint 稳定 + `birdc` 集成

### Linter 规则分级

| 分类            | 默认级别 | CI 策略 |
| --------------- | -------- | ------- |
| `syntax/*`      | error    | 阻塞    |
| `semantic/*`    | error    | 阻塞    |
| `security/*`    | error    | 阻塞    |
| `structure/*`   | warning  | 非阻塞  |
| `protocol/*`    | warning  | 非阻塞  |
| `performance/*` | info     | 非阻塞  |

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
    "safeMode": true
  },
  "linter": {
    "rules": {
      "security/*": "error",
      "performance/*": "info"
    }
  },
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

## References

- `TASKLIST.md`: 详细的实施计划和技术选型报告
- `.agents/skills/`: Claude Code skills for specialized tasks
  - `vscode-extension-builder/`: VS Code 扩展开发指南
  - `turborepo/`: Turborepo 最佳实践
  - `vitest/`: 测试指南
  - `typescript-e2e-testing/`: E2E 测试指南
