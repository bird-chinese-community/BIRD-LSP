# 🛠️ @birdcc/cli

<div align="center">

**BIRD2 配置文件的命令行工具集**

<p>
  <img src="https://img.shields.io/badge/version-0.1.0-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/TypeScript-5.9+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="typescript">
  <img src="https://img.shields.io/badge/BIRD-2.0+-FF6B6B?style=flat-square" alt="bird">
</p>

<p>
  <a href="#-功能特性">功能特性</a> •
  <a href="#-安装">安装</a> •
  <a href="#-使用指南">使用指南</a> •
  <a href="#-配置">配置</a>
</p>

</div>

---

## ✨ 功能特性

- 🔍 **Lint 检查** — 静态分析与语义检查，支持 JSON 输出便于 CI 集成
- 📝 **代码格式化** — 自动格式化 BIRD 配置文件
- 🖥️ **LSP 服务器** — 启动 Language Server Protocol 服务器
- 🔗 **BIRD 集成** — 调用 `bird -p` 进行运行时配置验证
- ⚡ **高性能** — 基于 Tree-sitter 的快速解析

---

## 📦 安装

### 全局安装（推荐）

```bash
# 使用 pnpm
pnpm add -g @birdcc/cli

# 使用 npm
npm install -g @birdcc/cli

# 使用 yarn
yarn global add @birdcc/cli
```

### 本地开发安装

```bash
# 在 BIRD-LSP 仓库中构建后使用
pnpm build
node packages/@birdcc/cli/dist/cli.js --help
```

---

## 📖 使用指南

### 🔍 `birdcc lint` — 配置检查

检查 BIRD 配置文件的语法和语义问题。

```bash
# 基本用法
birdcc lint bird.conf

# JSON 输出（适合 CI）
birdcc lint bird.conf --format json

# 结合 BIRD 运行时验证
birdcc lint bird.conf --bird

# 设置警告上限
birdcc lint bird.conf --max-warnings 0
```

**选项说明：**

| 选项                 | 简写 | 说明                              |
| -------------------- | ---- | --------------------------------- |
| `--format <type>`    | `-f` | 输出格式：`text` (默认) 或 `json` |
| `--bird`             | `-b` | 同时运行 BIRD 运行时验证          |
| `--max-warnings <n>` | `-w` | 允许的最大警告数，超出则失败      |
| `--help`             | `-h` | 显示帮助信息                      |

---

### 📝 `birdcc fmt` — 代码格式化

格式化 BIRD 配置文件。

```bash
# 检查格式（不写入）
birdcc fmt bird.conf --check

# 格式化并写入文件
birdcc fmt bird.conf --write

# 指定格式化引擎（dprint | builtin）
birdcc fmt bird.conf --check --engine dprint
```

**选项说明：**

| 选项      | 简写 | 说明                 |
| --------- | ---- | -------------------- |
| `--check` | `-c` | 检查格式，不写入文件 |
| `--write` | `-w` | 格式化并写入文件     |
| `--engine` | - | 格式化引擎：`dprint`（默认）或 `builtin` |
| `--help`  | `-h` | 显示帮助信息         |

---

### 🖥️ `birdcc lsp` — 启动 LSP 服务器

启动 Language Server Protocol 服务器，供编辑器集成使用。

```bash
# 标准输入输出模式（stdio）
birdcc lsp --stdio
```

**选项说明：**

| 选项      | 说明                       |
| --------- | -------------------------- |
| `--stdio` | 使用标准输入输出作为传输层 |

---

## ⚙️ 配置

在项目根目录创建 `birdcc.config.json` 文件：

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

**配置项说明：**

| 配置项                 | 类型      | 说明                                           |
| ---------------------- | --------- | ---------------------------------------------- |
| `formatter.engine`     | `string`  | 格式化引擎：`dprint`                           |
| `formatter.safeMode`   | `boolean` | 安全模式（不修改有错误的文件）                 |
| `linter.rules`         | `object`  | 规则级别映射                                   |
| `bird.validateCommand` | `string`  | BIRD 验证命令模板，`{file}` 会被替换为文件路径 |

---

## 🏗️ 架构位置

```
┌─────────────────────────────────────┐
│           @birdcc/cli               │  ← 命令行入口（本包）
│    lint / fmt / lsp --stdio         │
└─────────────┬───────────────────────┘
              │
    ┌─────────┼─────────┐
    ↓         ↓         ↓
┌───────┐ ┌───────┐ ┌─────────┐
│ core  │ │linter │ │  lsp    │
└───────┘ └───────┘ └─────────┘
```

---

## 🔗 相关包

| 包名             | 描述               | 链接                          |
| ---------------- | ------------------ | ----------------------------- |
| `@birdcc/parser` | 词法分析与语法解析 | [README](../parser/README.md) |
| `@birdcc/core`   | 语义分析与符号表   | [README](../core/README.md)   |
| `@birdcc/linter` | 规则引擎           | [README](../core/README.md)   |
| `@birdcc/lsp`    | LSP 服务器实现     | [README](../lsp/README.md)    |

---

## 📄 许可证

[MIT](../../../LICENSE)
