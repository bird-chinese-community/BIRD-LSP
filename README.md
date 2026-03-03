# 🐦 BIRD-LSP

<p align="center">
  <strong>为 BIRD2 配置文件提供现代化的 Language Server Protocol 支持</strong>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-GPL%203.0-green.svg?style=flat-square" alt="License" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/typescript-5.9+-3178c6.svg?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://turbo.build/">
    <img src="https://img.shields.io/badge/turborepo-2.8+-ef4444.svg?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" />
  </a>
  <a href="https://pnpm.io/">
    <img src="https://img.shields.io/badge/pnpm-10.18+-f69220.svg?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  </a>
  <br />
  <a href="https://vitest.dev/">
    <img src="https://img.shields.io/badge/vitest-3.2+-6e9f18.svg?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  </a>
  <a href="https://tree-sitter.github.io/tree-sitter/">
    <img src="https://img.shields.io/badge/tree--sitter-解析-417e87.svg?style=flat-square" alt="Tree-sitter" />
  </a>
  <a href="https://microsoft.github.io/language-server-protocol/">
    <img src="https://img.shields.io/badge/LSP-3.17+-3d5a80.svg?style=flat-square" alt="LSP" />
  </a>
</p>

---

## 📋 目录

- [项目简介](#-项目简介)
- [功能特性](#-功能特性)
- [快速开始](#-快速开始)
- [CLI 使用指南](#-cli-使用指南)
- [架构概览](#-架构概览)
- [开发指南](#-开发指南)
- [贡献指南](#-贡献指南)

---

## 🚀 项目简介

**BIRD-LSP** 是一个专为 [BIRD2](https://bird.network.cz/)（BIRD Internet Routing Daemon）配置文件打造的现代化工具链项目，提供完整的 Language Server Protocol (LSP) 支持、代码格式化与静态分析能力。

无论你是在管理大型 BGP 网络，还是编写复杂的 Filter 规则，BIRD-LSP 都能为你带来智能的 IDE 体验：

> 🎯 **智能提示** · 🔍 **实时诊断** · 📝 **代码格式化** · 🔧 **语法高亮** · 🏗️ **符号导航**

### 为什么需要 BIRD-LSP？

传统 BIRD 配置文件编辑体验原始，缺乏现代化的开发工具支持。BIRD-LSP 填补了这片空白，为网络工程师提供与编写现代代码同等级别的开发体验：

- **跨文件分析**：自动处理 `include` 指令，提供跨文件的符号解析与诊断
- **BIRD 原生验证**：集成 `bird -p` 校验，确保配置与生产环境语义一致
- **32+ 条 Lint 规则**：覆盖符号、配置、网络、类型、BGP、OSPF 六大类别
- **双引擎格式化**：dprint 高性能 + builtin 安全回退

---

## ✨ 功能特性

### LSP 功能矩阵

| 功能              | 描述                                           | 状态      |
| ----------------- | ---------------------------------------------- | --------- |
| 🎨 **语法高亮**   | 基于 Tree-sitter 的高精度语法解析              | ✅ 已实现 |
| 🔍 **实时诊断**   | 静态规则 + include 跨文件诊断 + `bird -p` 校验 | ✅ 已实现 |
| 📝 **代码格式化** | dprint 插件 + builtin 安全回退，支持自定义样式 | ✅ 已实现 |
| 💡 **智能补全**   | Protocol/Filter/Function 关键字与符号补全      | ✅ 已实现 |
| 🔎 **悬停提示**   | 类型信息、文档说明即时展示                     | ✅ 已实现 |
| 🏗️ **符号导航**   | 跳转到定义、查找引用（跨文件）                 | ✅ 已实现 |
| 📑 **文档大纲**   | Document Symbol 结构浏览                       | ✅ 已实现 |

### 跨文件分析能力

- ✅ `include` 指令自动展开（支持深度/文件数限制）
- ✅ 跨文件符号表合并与引用解析
- ✅ 循环 include 检测与诊断
- ✅ 内存 + 文件系统混合加载策略

### BIRD 原生集成

- ✅ `bird -p` 配置预检集成
- ✅ 诊断格式自动转译（支持 `file:line:col` 与 `Parse error` 两种格式）
- ✅ 可配置的验证命令模板

---

## 🚦 快速开始

### 环境要求

- **Node.js** ≥ 20
- **pnpm** ≥ 10.18
- **Rust** ≥ 1.70（用于构建 dprint 插件）
- **BIRD2** ≥ 2.15（可选，用于配置验证）

### 安装步骤

```bash
# 1️⃣ 克隆仓库（包含 submodules）
git clone --recursive https://github.com/bird-chinese-community/BIRD-LSP.git
cd BIRD-LSP

# 2️⃣ 安装依赖
pnpm install

# 3️⃣ 构建所有包（包括 Rust WASM 插件）
pnpm build

# 4️⃣ 运行测试
pnpm test
```

### 配置 birdcc

创建 `birdcc.config.json`（可选）：

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/birdcc-tooling.schema.json",
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

---

## 🛠️ CLI 使用指南

### `birdcc lint` - 配置检查

```bash
# 基础检查
birdcc lint bird.conf

# JSON 输出
birdcc lint bird.conf --format json

# 启用 BIRD 原生验证
birdcc lint bird.conf --bird

# 跨文件分析（默认启用）
birdcc lint bird.conf --cross-file

# 限制 include 展开深度和文件数
birdcc lint bird.conf --include-max-depth 10 --include-max-files 100

# 使用自定义验证命令
birdcc lint bird.conf --bird --validate-command "bird -p -c {file}"
```

### `birdcc fmt` - 代码格式化

```bash
# 检查格式（不修改文件）
birdcc fmt bird.conf --check

# 格式化并写入文件
birdcc fmt bird.conf --write

# 指定格式化引擎
birdcc fmt bird.conf --write --engine dprint
birdcc fmt bird.conf --write --engine builtin
```

### `birdcc lsp` - 启动 LSP 服务器

```bash
# 通过 stdio 启动（用于编辑器集成）
birdcc lsp --stdio
```

### VS Code 集成

VS Code 扩展正在开发中，目前可通过以下方式使用 LSP：

1. 安装 [LSP 客户端插件](https://marketplace.visualstudio.com/items?itemName=webfreak.code-d)
2. 配置 `settings.json`：

```json
{
  "languageServerExample.birdcc": {
    "command": "node",
    "args": [
      "/path/to/BIRD-LSP/packages/@birdcc/cli/dist/cli.js",
      "lsp",
      "--stdio"
    ],
    "filetypes": ["bird"]
  }
}
```

---

## 🏗️ 架构概览

### 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    编辑器层 (Editors)                    │
│              VSCode / Neovim / Vim / Emacs              │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   @birdcc/lsp                           │
│         LSP 服务器实现 (Diagnostics/Hover/Completion)    │
└─────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐        ┌─────────────────────────┐
│   @birdcc/linter    │        │   @birdcc/formatter     │
│   32+ 条规则引擎     │        │   dprint/builtin 格式化  │
│   (sym/cfg/net/     │        │                           │
│    type/bgp/ospf)   │        │                           │
└─────────────────────┘        └─────────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   @birdcc/core                          │
│         语义层 (AST / 符号表 / 类型检查 / 跨文件解析)      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   @birdcc/parser                        │
│         Tree-sitter 语法解析 + WASM 适配器               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   BIRD 守护进程                          │
│              bird -p 验证集成（可选）                     │
└─────────────────────────────────────────────────────────┘
```

### 包依赖关系

```
@birdcc/parser (底层基础)
      ↑
@birdcc/core (语义分析 + 跨文件解析)
      ↑
@birdcc/linter (规则引擎)
      ↑
@birdcc/lsp (LSP 服务)

@birdcc/formatter (独立，双引擎)
@birdcc/dprint-plugin-bird (dprint 插件)
@birdcc/cli (聚合入口，依赖所有包)
```

### 核心包说明

| 包名                         | 职责                                        | 技术栈                        |
| ---------------------------- | ------------------------------------------- | ----------------------------- |
| `@birdcc/parser`             | Tree-sitter Grammar + WASM 绑定 + JS 适配器 | Tree-sitter, WASM, TypeScript |
| `@birdcc/core`               | AST 遍历、符号表构建、类型检查、跨文件解析  | TypeScript                    |
| `@birdcc/linter`             | 32+ 条 Lint 规则、诊断生成                  | TypeScript                    |
| `@birdcc/lsp`                | LSP 处理器、消息路由、IDE 功能              | vscode-languageserver-node    |
| `@birdcc/formatter`          | 格式化引擎（dprint + builtin）              | dprint, TypeScript            |
| `@birdcc/dprint-plugin-bird` | dprint 官方插件格式                         | Rust, WASM                    |
| `@birdcc/cli`                | 命令行入口、配置解析、服务编排              | cac                           |

### Linter 规则体系

| 分类     | 规则数 | 默认级别 | 说明                                         |
| -------- | ------ | -------- | -------------------------------------------- |
| `sym/*`  | 7      | error    | 符号表相关（未定义、重复定义、类型不匹配等） |
| `cfg/*`  | 9      | error    | 配置错误（语法错误、值范围、类型不兼容等）   |
| `net/*`  | 4      | error    | 网络地址相关（前缀长度、IPv4/IPv6 格式等）   |
| `type/*` | 3      | error    | 类型系统（类型不匹配、不可迭代等）           |
| `bgp/*`  | 5      | warning  | BGP 协议规则（缺少 local-as、neighbor 等）   |
| `ospf/*` | 4      | warning  | OSPF 协议规则（area 配置、backbone 等）      |

---

## 🛠️ 开发指南

### 常用命令

```bash
# 📦 构建所有包
pnpm build

# 👀 开发模式（监听文件变化）
pnpm dev

# ✅ 运行测试
pnpm test

# 🔍 代码检查
pnpm lint

# 💅 代码格式化
pnpm format

# 📐 类型检查
pnpm typecheck
```

### 包级操作

```bash
# 仅构建特定包
pnpm --filter @birdcc/parser build

# 运行特定包的测试
pnpm --filter @birdcc/core test

# 调试单个测试文件
pnpm vitest run packages/@birdcc/parser/src/index.test.ts

# 交互式测试模式
pnpm vitest
```

### Turborepo 高级用法

```bash
# 仅构建变更的包
turbo run build --affected

# 强制重新构建（忽略缓存）
turbo run build --force

# 并行运行任务
turbo run lint typecheck test --parallel
```

### 目录结构

```
BIRD-LSP/
├── packages/
│   └── @birdcc/
│       ├── parser/              # Tree-sitter 语法解析
│       ├── core/                # AST/符号表/类型检查/跨文件解析
│       ├── linter/              # Lint 规则 (32+ 条)
│       ├── lsp/                 # LSP 服务器
│       ├── formatter/           # 格式化引擎
│       ├── dprint-plugin-bird/  # dprint 官方插件
│       └── cli/                 # CLI 入口
├── refer/                       # Git submodules
│   ├── BIRD-source-code/        # BIRD 官方源码
│   ├── BIRD-tm-language-grammar/# TextMate 语法
│   └── BIRD2-vim-grammar/       # Vim 语法
└── turbo.json                   # Turborepo 配置
```

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！无论是提交 Bug 报告、功能请求，还是代码贡献。

### 开发工作流

1. **Fork 仓库** 并克隆到本地

2. **创建功能分支**

   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **提交更改**（遵循 Conventional Commits）

   ```bash
   git commit -m "feat(parser): add support for multi-word phrases"
   ```

4. **推送分支**

   ```bash
   git push origin feature/amazing-feature
   ```

5. **创建 Pull Request**

### 提交规范

| 类型       | 描述                   |
| ---------- | ---------------------- |
| `feat`     | 新功能                 |
| `fix`      | 修复 Bug               |
| `docs`     | 文档更新               |
| `style`    | 代码风格（不影响功能） |
| `refactor` | 代码重构               |
| `perf`     | 性能优化               |
| `test`     | 测试相关               |
| `chore`    | 构建/工具链            |

### 代码规范

- 使用 **TypeScript** 编写所有代码
- 遵循 **ESM** 模块规范 (`"type": "module"`)
- 使用 **oxlint** 进行代码检查
- 使用 **oxfmt** 进行代码格式化
- 使用 **Vitest** 编写单元测试
- 对话使用 **Chinese**，代码注释和文档字符串可使用 **English**

---

## 📚 相关资源

- [BIRD 官方文档](https://bird.network.cz/)
- [Language Server Protocol 规范](https://microsoft.github.io/language-server-protocol/)
- [Tree-sitter 文档](https://tree-sitter.github.io/tree-sitter/)
- [dprint 文档](https://dprint.dev/)
- [Turborepo 指南](https://turbo.build/repo/docs)

## 📝 许可证

本项目采用 [GPL-3.0 License](LICENSE) 开源许可证。

---

<p align="center">
  <sub>Built with ❤️ by the BIRD-LSP Team</sub>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/issues">🐛 报告问题</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/discussions">💬 参与讨论</a>
</p>
