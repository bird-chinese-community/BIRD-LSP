# 🐦 BIRD-LSP

<p align="center">
  <strong>为 BIRD2 配置文件提供现代化的 Language Server Protocol 支持</strong>
</p>

<p align="center">
  <a href="https://github.com/your-org/BIRD-LSP/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" />
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
- [架构概览](#-架构概览)
- [开发指南](#-开发指南)
- [贡献指南](#-贡献指南)

---

## 🚀 项目简介

**BIRD-LSP** 是一个专为 [BIRD2](https://bird.network.cz/)（BIRD Internet Routing Daemon）配置文件打造的现代化工具链项目，提供完整的 Language Server Protocol (LSP) 支持。

无论你是在管理大型 BGP 网络，还是编写复杂的 Filter 规则，BIRD-LSP 都能为你带来智能的 IDE 体验：

> 🎯 **智能提示** · 🔍 **实时诊断** · 📝 **代码格式化** · 🔧 **语法高亮**

### 为什么需要 BIRD-LSP？

传统 BIRD 配置文件编辑体验原始，缺乏现代化的开发工具支持。BIRD-LSP 填补了这片空白，为网络工程师提供与编写现代代码同等级别的开发体验。

---

## ✨ 功能特性

| 功能 | 描述 | 状态 |
|------|------|------|
| 🎨 **语法高亮** | 基于 Tree-sitter 的高精度语法解析 | ✅ 已实现 |
| 🔍 **实时诊断** | 集成 `bird -p` 的原生配置验证 | ✅ 已实现 |
| 📝 **代码格式化** | dprint 插件，支持自定义样式 | 🚧 开发中 |
| 💡 **智能补全** | Protocol/Filter/Function 自动补全 | 🚧 开发中 |
| 🔎 **悬停提示** | 类型信息、文档说明即时展示 | 📋 计划中 |
| 🏗️ **符号导航** | 跳转到定义、查找引用 | 📋 计划中 |

### CLI 工具链 (`birdcc`)

```bash
# 🔍 检查配置文件
$ birdcc lint bird.conf --format json

# 📝 格式化输出
$ birdcc fmt bird.conf --write

# 🖥️ 启动 LSP 服务器
$ birdcc lsp --stdio
```

---

## 🚦 快速开始

### 环境要求

- **Node.js** ≥ 20
- **pnpm** ≥ 10.18
- **BIRD2** ≥ 2.15（用于配置验证）

### 安装步骤

```bash
# 1️⃣ 克隆仓库（包含 submodules）
git clone --recursive https://github.com/your-org/BIRD-LSP.git
cd BIRD-LSP

# 2️⃣ 安装依赖
pnpm install

# 3️⃣ 构建所有包
pnpm build

# 4️⃣ 运行测试
pnpm test
```

### 使用示例

#### 检查配置文件

```bash
$ node packages/@birdcc/cli/dist/cli.js lint sample/bgp.conf --format stylish

✖ 2 problems (1 error, 1 warning)
  0 errors and 1 warning potentially fixable with the `--fix` option.

  15:3  error    Missing 'local as' in BGP protocol  semantic/missing-local-as
  42:1  warning  Duplicate filter definition         structure/duplicate-filter
```

#### 格式化配置

```bash
$ node packages/@birdcc/cli/dist/cli.js fmt sample/bgp.conf --write

✔ Formatted sample/bgp.conf (234 lines, 12 changes)
```

#### VS Code 集成

VS Code 扩展正在开发中，敬请期待！

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
│   规则引擎/诊断       │        │   dprint 格式化插件      │
└─────────────────────┘        └─────────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   @birdcc/core                          │
│         语义层 (AST / 符号表 / 类型检查)                  │
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
│              bird -p / birdc 集成                        │
└─────────────────────────────────────────────────────────┘
```

### 包依赖关系

```
@birdcc/parser (底层基础)
      ↑
@birdcc/core (语义分析)
      ↑
@birdcc/linter (规则引擎)
      ↑
@birdcc/lsp (LSP 服务)

@birdcc/cli (聚合入口，依赖所有包)
@birdcc/formatter (独立 dprint 插件)
```

### 核心包说明

| 包名 | 职责 | 技术栈 |
|------|------|--------|
| `@birdcc/parser` | Tree-sitter Grammar + WASM 绑定 + JS 适配器 | Tree-sitter, WASM, TypeScript |
| `@birdcc/core` | AST 遍历、符号表构建、类型检查 | TypeScript |
| `@birdcc/linter` | Lint 规则、诊断生成、BIRD 集成 | TypeScript |
| `@birdcc/lsp` | LSP 处理器、消息路由、IDE 功能 | vscode-languageserver-node |
| `@birdcc/formatter` | dprint 格式化插件 | dprint, TypeScript |
| `@birdcc/cli` | 命令行入口、配置解析、服务编排 | Commander.js |

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
│   ├── @birdcc/
│   │   ├── parser/          # Tree-sitter 语法解析
│   │   ├── core/            # AST/符号表/类型检查
│   │   ├── linter/          # Lint 规则
│   │   ├── lsp/             # LSP 服务器
│   │   ├── formatter/       # dprint 插件
│   │   └── cli/             # CLI 入口
│   └── sample/              # 测试配置样例
├── refer/                   # Git submodules
│   ├── BIRD-source-code/    # BIRD 官方源码
│   ├── BIRD-tm-language-grammar/  # TextMate 语法
│   └── BIRD2-vim-grammar/   # Vim 语法
└── turbo.json               # Turborepo 配置
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

| 类型 | 描述 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 Bug |
| `docs` | 文档更新 |
| `style` | 代码风格（不影响功能）|
| `refactor` | 代码重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具链 |

### 代码规范

- 使用 **TypeScript** 编写所有代码
- 遵循 **ESM** 模块规范 (`"type": "module"`)
- 使用 **oxlint** 进行代码检查
- 使用 **oxfmt** 进行代码格式化
- 使用 **Vitest** 编写单元测试

---

## 📚 相关资源

- [BIRD 官方文档](https://bird.network.cz/)
- [Language Server Protocol 规范](https://microsoft.github.io/language-server-protocol/)
- [Tree-sitter 文档](https://tree-sitter.github.io/tree-sitter/)
- [Turborepo 指南](https://turbo.build/repo/docs)

## 📝 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

---

<p align="center">
  <sub>Built with ❤️ by the BIRD-LSP Team</sub>
</p>

<p align="center">
  <a href="https://github.com/your-org/BIRD-LSP/issues">🐛 报告问题</a> ·
  <a href="https://github.com/your-org/BIRD-LSP/discussions">💬 参与讨论</a> ·
  <a href="https://birdcc.link">🌐 官方网站</a>
</p>
