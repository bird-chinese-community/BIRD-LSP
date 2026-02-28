# 🐦 @birdcc/lsp & @birdcc/cli

<div align="center">

**BIRD2 配置语言的 Language Server Protocol 实现**

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/birdcc/bird-lsp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![BIRD](https://img.shields.io/badge/BIRD-2.0+-FF6B6B?logo=bird&logoColor=white)](https://bird.network.cz/)

[English](#english) | [中文](#中文)

</div>

---

<a name="中文"></a>

## 中文文档

### 📖 简介

`@birdcc/lsp` 与 `@birdcc/cli` 是 [BIRD-LSP](https://github.com/birdcc/bird-lsp) 工具链的核心组件，为 BIRD2（BIRD Internet Routing Daemon）配置文件提供完整的 Language Server Protocol (LSP) 支持与命令行工具集。

| 包名          | 版本  | 描述                                     |
| ------------- | ----- | ---------------------------------------- |
| `@birdcc/lsp` | 0.1.0 | LSP 服务器实现，提供实时诊断与编辑器集成 |
| `@birdcc/cli` | 0.1.0 | 命令行工具，提供 lint、format、lsp 命令  |

---

### ✨ 功能特性

#### 🔍 LSP 服务器 (`@birdcc/lsp`)

- **标准 LSP 实现**：基于 `vscode-languageserver` 的完整协议支持
- **增量同步**：`TextDocumentSyncKind.Incremental` 高效处理大文件
- **实时诊断**：文档打开/修改时自动触发检查
- **协议转换**：内部诊断格式无缝转换为 LSP Diagnostic

#### 🛠️ CLI 工具 (`@birdcc/cli`)

- **Lint 检查**：静态分析与 BIRD 运行时验证
- **代码格式化**：去除行尾空格，合并多余空行
- **LSP 模式**：stdio 传输模式启动语言服务器
- **BIRD 集成**：解析 `bird -p` 输出，支持多种错误格式

---

### 📦 安装

```bash
# 通过 pnpm 安装（推荐）
pnpm add -D @birdcc/lsp @birdcc/cli

# 或通过 npm
npm install -D @birdcc/lsp @birdcc/cli

# 或通过 yarn
yarn add -D @birdcc/lsp @birdcc/cli
```

---

### 🚀 快速开始

#### 1. 使用 CLI 检查配置文件

```bash
# Lint 检查（文本输出）
npx birdcc lint bird.conf

# Lint 检查（JSON 输出，便于 CI 集成）
npx birdcc lint bird.conf --format json

# 结合 BIRD 运行时验证
npx birdcc lint bird.conf --bird

# 格式化检查
npx birdcc fmt bird.conf --check

# 格式化并写入文件
npx birdcc fmt bird.conf --write
```

#### 2. 启动 LSP 服务器

```bash
# stdio 模式（用于编辑器集成）
npx birdcc lsp --stdio
```

---

### 📚 CLI 命令详解

#### `birdcc lint <file>` - 代码检查

检查 BIRD2 配置文件的语法和语义问题。

```bash
birdcc lint <file> [options]
```

**选项：**

| 选项                 | 类型             | 默认值              | 描述                     |
| -------------------- | ---------------- | ------------------- | ------------------------ |
| `--format`           | `json` \| `text` | `text`              | 输出格式                 |
| `--bird`             | boolean          | `false`             | 同时运行 BIRD 运行时验证 |
| `--validate-command` | string           | `bird -p -c {file}` | 自定义验证命令           |

**示例：**

```bash
# 文本格式输出
birdcc lint bird.conf
# ERROR syntax/unexpected-token 15:8 Unexpected token 'protocol'

# JSON 格式输出
birdcc lint bird.conf --format json
# {
#   "diagnostics": [
#     {
#       "code": "syntax/unexpected-token",
#       "message": "Unexpected token 'protocol'",
#       "severity": "error",
#       "range": { "line": 15, "column": 8 }
#     }
#   ]
# }

# 结合 BIRD 验证
birdcc lint bird.conf --bird --validate-command "sudo bird -p -c {file}"
```

#### `birdcc fmt <file>` - 代码格式化

格式化 BIRD2 配置文件。

```bash
birdcc fmt <file> [options]
```

**选项：**

| 选项      | 类型    | 默认值  | 描述                   |
| --------- | ------- | ------- | ---------------------- |
| `--check` | boolean | `false` | 仅检查格式，不修改文件 |
| `--write` | boolean | `false` | 写入格式化后的内容     |

**注意：** `--check` 和 `--write` 不能同时使用。

**示例：**

```bash
# 检查格式
birdcc fmt bird.conf --check
# ✗ Format check failed

# 格式化并写入
birdcc fmt bird.conf --write
# ✓ Formatted and written to bird.conf
```

#### `birdcc lsp` - 语言服务器

启动 LSP 服务器进程。

```bash
birdcc lsp [options]
```

**选项：**

| 选项      | 类型    | 必需 | 描述            |
| --------- | ------- | ---- | --------------- |
| `--stdio` | boolean | ✓    | 使用 stdio 传输 |

**示例：**

```bash
birdcc lsp --stdio
```

---

### 🔧 编辑器集成

#### Visual Studio Code

安装 BIRD-LSP 扩展（计划中）：

```json
// settings.json
{
  "bird-lsp.enable": true,
  "bird-lsp.path": "./node_modules/.bin/birdcc",
  "bird-lsp.validateWithBird": true,
  "bird-lsp.validateCommand": "bird -p -c {file}"
}
```

#### Neovim

使用 `nvim-lspconfig` 配置：

```lua
-- init.lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- 注册 birdcc LSP
if not configs.birdcc then
  configs.birdcc = {
    default_config = {
      cmd = { 'npx', 'birdcc', 'lsp', '--stdio' },
      filetypes = { 'bird', 'conf' },
      root_dir = lspconfig.util.root_pattern('.git', 'bird.conf'),
      single_file_support = true,
      settings = {},
    },
  }
end

lspconfig.birdcc.setup({})

-- 或者使用自动命令
vim.api.nvim_create_autocmd({ "BufRead", "BufNewFile" }, {
  pattern = "*.conf",
  callback = function(args)
    -- 检测 BIRD 配置文件
    local first_line = vim.fn.getline(1)
    if first_line:match("^router id") or first_line:match("^log") then
      vim.lsp.start({
        name = "birdcc",
        cmd = { "npx", "birdcc", "lsp", "--stdio" },
        root_dir = vim.fn.getcwd(),
      })
    end
  end,
})
```

#### Vim / coc.nvim

```json
// coc-settings.json
{
  "languageserver": {
    "birdcc": {
      "command": "npx",
      "args": ["birdcc", "lsp", "--stdio"],
      "filetypes": ["bird", "conf"],
      "rootPatterns": [".git", "bird.conf"],
      "requireRootPattern": false
    }
  }
}
```

#### Helix

```toml
# ~/.config/helix/languages.toml
[[language]]
name = "bird"
file-types = ["conf"]
roots = [".git", "bird.conf"]
language-servers = ["birdcc"]

[language-server.birdcc]
command = "npx"
args = ["birdcc", "lsp", "--stdio"]
```

---

### 🔗 BIRD 集成配置

#### 配置验证命令

通过 `birdcc.config.json` 或 CLI 参数自定义 BIRD 验证命令：

```json
// birdcc.config.json
{
  "$schema": "https://birdcc.link/schemas/birdcc-tooling.schema.json",
  "bird": {
    "validateCommand": "sudo bird -p -c {file}"
  }
}
```

#### 支持的错误格式

`@birdcc/cli` 支持解析以下 BIRD 错误输出格式：

| 格式        | 示例                                                 |
| ----------- | ---------------------------------------------------- |
| 标准格式    | `bird.conf:15:8 syntax error, unexpected 'protocol'` |
| Parse Error | `Parse error bird.conf, line 15: syntax error`       |
| 遗留格式    | `bird.conf, line 15:8 syntax error`                  |

---

### 📡 API 参考

#### `@birdcc/lsp` 导出

```typescript
import { startLspServer, toLspDiagnostic } from '@birdcc/lsp';
import type { Diagnostic } from 'vscode-languageserver';
import type { BirdDiagnostic } from '@birdcc/core';

// 启动 LSP 服务器
startLspServer(): void;

// 转换诊断格式
toLspDiagnostic(diagnostic: BirdDiagnostic): Diagnostic;
```

#### `@birdcc/cli` 导出

```typescript
import {
  runLint,
  runFmt,
  runLspStdio,
  runBirdValidation,
  formatBirdConfigText,
  parseBirdStderr
} from '@birdcc/cli';

// Lint 检查
runLint(filePath: string, options?: LintOptions): BirdccLintOutput;

// 格式化
runFmt(filePath: string, options?: FmtOptions): FmtResult;

// 启动 LSP（stdio 模式）
runLspStdio(): void;

// BIRD 运行时验证
runBirdValidation(
  filePath: string,
  validateCommand?: string
): BirdValidateResult;

// 格式化文本（纯函数）
formatBirdConfigText(text: string): FmtResult;

// 解析 BIRD stderr
parseBirdStderr(stderr: string): BirdDiagnostic[];
```

**类型定义：**

```typescript
interface LintOptions {
  withBird?: boolean; // 启用 BIRD 验证
  validateCommand?: string; // 自定义验证命令
}

interface FmtOptions {
  write?: boolean; // 写入文件
}

interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

interface FmtResult {
  changed: boolean; // 是否发生变更
  formattedText: string; // 格式化后的文本
}

interface BirdValidateResult {
  command: string; // 执行的命令
  exitCode: number; // 退出码
  stderr: string; // 标准错误输出
  stdout: string; // 标准输出
  diagnostics: BirdDiagnostic[]; // 解析后的诊断
}
```

---

### 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      编辑器 (VSCode/Neovim)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ LSP Protocol
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    @birdcc/lsp                              │
│              (LSP 服务器 / 诊断推送)                          │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────┐          ┌──────────────────────┐
│   @birdcc/linter     │          │  @birdcc/formatter   │
│   (规则 / 诊断)       │          │   (dprint 插件)       │
└──────────┬───────────┘          └──────────┬───────────┘
           │                                  │
           └──────────────┬───────────────────┘
                          ▼
               ┌──────────────────────┐
               │    @birdcc/core      │
               │ (AST / 符号表 / 类型) │
               └──────────┬───────────┘
                          ▼
               ┌──────────────────────┐
               │   @birdcc/parser     │
               │  (Tree-sitter + WASM) │
               └──────────────────────┘
```

---

### 🤝 参与贡献

我们欢迎各种形式的贡献！请查看 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解详情。

```bash
# 克隆仓库
git clone https://github.com/birdcc/bird-lsp.git
cd bird-lsp

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test
```

---

<a name="english"></a>

## English Documentation

### 📖 Introduction

`@birdcc/lsp` and `@birdcc/cli` are core components of the [BIRD-LSP](https://github.com/birdcc/bird-lsp) toolchain, providing complete Language Server Protocol (LSP) support and command-line tools for BIRD2 (BIRD Internet Routing Daemon) configuration files.

| Package       | Version | Description                                          |
| ------------- | ------- | ---------------------------------------------------- |
| `@birdcc/lsp` | 0.1.0   | LSP server implementation with real-time diagnostics |
| `@birdcc/cli` | 0.1.0   | Command-line tools for lint, format, and LSP         |

---

### ✨ Features

#### 🔍 LSP Server (`@birdcc/lsp`)

- **Standard LSP**: Full protocol support based on `vscode-languageserver`
- **Incremental Sync**: `TextDocumentSyncKind.Incremental` for efficient large file handling
- **Real-time Diagnostics**: Automatic validation on document open/change
- **Protocol Conversion**: Seamless conversion from internal to LSP diagnostic format

#### 🛠️ CLI Tools (`@birdcc/cli`)

- **Lint**: Static analysis and BIRD runtime validation
- **Format**: Remove trailing whitespace, compact blank lines
- **LSP Mode**: Start language server in stdio transport mode
- **BIRD Integration**: Parse `bird -p` output, support multiple error formats

---

### 📦 Installation

```bash
# Via pnpm (recommended)
pnpm add -D @birdcc/lsp @birdcc/cli

# Or via npm
npm install -D @birdcc/lsp @birdcc/cli

# Or via yarn
yarn add -D @birdcc/lsp @birdcc/cli
```

---

### 🚀 Quick Start

#### 1. CLI Usage

```bash
# Lint (text output)
npx birdcc lint bird.conf

# Lint (JSON output for CI)
npx birdcc lint bird.conf --format json

# With BIRD runtime validation
npx birdcc lint bird.conf --bird

# Format check
npx birdcc fmt bird.conf --check

# Format and write
npx birdcc fmt bird.conf --write
```

#### 2. Start LSP Server

```bash
# stdio mode (for editor integration)
npx birdcc lsp --stdio
```

---

### 📄 License

[MIT](../../LICENSE) © BIRD-LSP Contributors
