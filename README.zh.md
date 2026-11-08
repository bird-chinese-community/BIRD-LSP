<div align="center">

<img src="./packages/@birdcc/vscode/assets/icon-256.png" width="128" height="128" alt="BIRD-LSP" />

# BIRD-LSP

BIRD 2 与 BIRD 3 配置文件的语言服务器、Linter、格式化器与命令行工具。

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/BIRDCC.bird2-lsp.svg?label=VS%20Marketplace&color=007ACC&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp)
[![Open VSX](https://img.shields.io/open-vsx/v/BIRDCC/bird2-lsp?style=flat-square&label=Open%20VSX&color=C160EF)](https://open-vsx.org/extension/BIRDCC/bird2-lsp)
[![npm](https://img.shields.io/npm/v/@birdcc/cli?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/cli)
[![CI](https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/ci.yml/badge.svg)](https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](./LICENSE)

[English](./README.md) | 简体中文

</div>

## 功能

- **解析**：Tree-sitter 语法编译成 WebAssembly，解析 BIRD 2 与 BIRD 3 配置文件。遇到语法错误时继续解析，错误之后的声明照常参与分析。
- **诊断**：32 条 lint 规则，分为 `sym`、`cfg`、`net`、`type`、`bgp`、`ospf` 六组。分析会跟随 `include` 语句读取其他文件，默认最多 16 层、256 个文件。`birdcc lint --bird` 还会对每个被检查的文件运行 `bird -p`。
- **格式化**：两个引擎。默认引擎是用 Rust 编写、编译成 WebAssembly 的 dprint 插件，另一个是内置的 TypeScript 格式化器。安全模式会分别解析输入与输出，两者的声明或解析错误不一致时拒绝输出。
- **编辑器功能**：补全、关键字与符号悬停提示、跨 include 文件的跳转定义、在整个 include 图中查找 `from` 子句对模板的引用、文档符号、文档格式化，以及函数返回类型与 AS 号的内嵌提示（inlay hints）。
- **ASN 数据**：`@birdcc/intel` 附带一份离线 AS 号数据库，数据来自 BGP.Tools OpenDB。语言服务器用它提供 ASN 补全、悬停提示与内嵌提示。
- **项目配置**：`bird.config.json` 指定入口文件或一组工作区目录、include 搜索路径、分析上限、规则级别、格式化选项和 `bird -p` 命令。`birdcc init` 会探测入口文件并写出这份配置。

## 快速上手

### 编辑器

- **VS Code** 1.100 及以上，以及从 Open VSX 安装扩展的编辑器：安装 [`BIRDCC.bird2-extension-pack`](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack)（[Open VSX](https://open-vsx.org/extension/BIRDCC/bird2-extension-pack)），它包含内置语言服务器的 [`BIRDCC.bird2-lsp`](./packages/@birdcc/vscode/README.md) 与语法高亮扩展 `BIRDCC.vscode-bird2-conf`。
- **Neovim、Vim、Helix、JetBrains IDE 及其他 LSP 客户端**：用 `@birdcc/cli` 的 `birdcc lsp --stdio` 启动语言服务器。[BIRD.nvim](https://github.com/bird-chinese-community/BIRD.nvim) 与 [BIRD.vim](https://github.com/bird-chinese-community/BIRD.vim) 提供文件类型识别与语法高亮。

阅读更多 » [安装](https://bird-chinese-community.github.io/zh-cn/getting-started/installation/)

### 命令行

命令行工具需要 Node.js 22 或更新版本。

```bash
npm install -g @birdcc/cli

birdcc init --write            # 探测入口文件并写出 bird.config.json
birdcc lint                    # 检查 bird.config.json 中指定的入口文件
birdcc lint bird.conf --bird   # 同时运行 `bird -p`
birdcc fmt bird.conf           # 文件需要格式化时退出码为 1
birdcc fmt bird.conf --write   # 原地格式化
birdcc lsp --stdio             # 启动语言服务器
```

阅读更多 » [快速上手](https://bird-chinese-community.github.io/zh-cn/getting-started/quick-start/) · [CLI 参考](https://bird-chinese-community.github.io/zh-cn/cli/) · [lint 规则](https://bird-chinese-community.github.io/zh-cn/linting/rules/)

### GitHub Actions

[setup-birdcc](https://github.com/bird-chinese-community/setup-birdcc) 在 GitHub Actions runner 上安装 Node.js、pnpm 与 BIRD，供 `birdcc lint`、`birdcc fmt --check` 与 `bird -p` 任务使用。

阅读更多 » [GitHub Actions](https://bird-chinese-community.github.io/zh-cn/ci/github-actions/)

## 包

| 包                                                                     | 发布渠道                      | 内容                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| [`@birdcc/parser`](./packages/@birdcc/parser/)                         | npm                           | Tree-sitter 语法、WebAssembly 构建产物、`parseBirdConfig`                                   |
| [`@birdcc/core`](./packages/@birdcc/core/)                             | npm                           | 符号表、类型检查、跨文件 `include` 解析、项目配置、入口探测                                 |
| [`@birdcc/linter`](./packages/@birdcc/linter/)                         | npm                           | 32 条 lint 规则                                                                             |
| [`@birdcc/formatter`](./packages/@birdcc/formatter/)                   | npm                           | dprint 与内置两个格式化引擎、安全模式                                                       |
| [`@birdcc/dprint-plugin-bird`](./packages/@birdcc/dprint-plugin-bird/) | npm                           | 由 Rust 编译成 WebAssembly 的 dprint 插件                                                   |
| [`@birdcc/intel`](./packages/@birdcc/intel/)                           | npm                           | 离线 ASN 数据库                                                                             |
| [`@birdcc/lsp`](./packages/@birdcc/lsp/)                               | npm                           | 语言服务器                                                                                  |
| [`@birdcc/cli`](./packages/@birdcc/cli/)                               | npm                           | `birdcc` 命令：`init`、`lint`、`fmt`、`lsp`                                                 |
| [`@birdcc/vscode`](./packages/@birdcc/vscode/)                         | VS Code Marketplace、Open VSX | VS Code 扩展 `BIRDCC.bird2-lsp`                                                             |
| [`bird2-extension-pack`](./packages/@birdcc/vscode-pack/)              | VS Code Marketplace、Open VSX | 扩展包 `BIRDCC.bird2-extension-pack`，包含 `BIRDCC.bird2-lsp` 与 `BIRDCC.vscode-bird2-conf` |

阅读更多 » [npm 包](https://bird-chinese-community.github.io/zh-cn/packages/)

## 架构

箭头从一个包指向它在 `dependencies` 中声明的包。点击包名可以打开它的 README。

```mermaid
flowchart TD
    VSCODE["@birdcc/vscode"]
    CLI["@birdcc/cli"]
    LSP["@birdcc/lsp"]
    LINTER["@birdcc/linter"]
    FORMATTER["@birdcc/formatter"]
    INTEL["@birdcc/intel"]
    CORE["@birdcc/core"]
    DPRINT["@birdcc/dprint-plugin-bird"]
    PARSER["@birdcc/parser"]

    VSCODE --> LSP
    VSCODE --> FORMATTER
    VSCODE --> CORE
    VSCODE --> PARSER
    CLI --> LSP
    CLI --> LINTER
    CLI --> FORMATTER
    CLI --> CORE
    LSP --> LINTER
    LSP --> FORMATTER
    LSP --> INTEL
    LSP --> CORE
    LSP --> PARSER
    LINTER --> CORE
    LINTER --> PARSER
    FORMATTER --> DPRINT
    FORMATTER --> PARSER
    CORE --> PARSER

    click VSCODE href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/vscode/README.md" "@birdcc/vscode README" _blank
    click CLI href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/cli/README.md" "@birdcc/cli README" _blank
    click LSP href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/lsp/README.md" "@birdcc/lsp README" _blank
    click LINTER href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/linter/README.md" "@birdcc/linter README" _blank
    click FORMATTER href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/formatter/README.md" "@birdcc/formatter README" _blank
    click INTEL href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/intel/README.md" "@birdcc/intel README" _blank
    click CORE href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/core/README.md" "@birdcc/core README" _blank
    click DPRINT href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/dprint-plugin-bird/README.md" "@birdcc/dprint-plugin-bird README" _blank
    click PARSER href "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/parser/README.md" "@birdcc/parser README" _blank
```

阅读更多 » [架构](https://bird-chinese-community.github.io/zh-cn/architecture/)

## 开发

构建需要 Node.js 22 或更新版本、pnpm，以及带 `wasm32-unknown-unknown` target 与 `llvm-tools` 组件的 Rust。

```bash
git clone https://github.com/bird-chinese-community/BIRD-LSP.git
cd BIRD-LSP
git submodule update --init --depth 1 refer/BIRD-source-code refer/BIRD-tm-language-grammar refer/BIRD2-vim-grammar
rustup target add wasm32-unknown-unknown
rustup component add llvm-tools
pnpm install
pnpm build
pnpm test
```

阅读更多 » [参与贡献](https://bird-chinese-community.github.io/zh-cn/contributing/)

## 文档

[BIRDCC 使用手册 & 技术文档 (Developer Preview)](https://bird-chinese-community.github.io/zh-cn/) 介绍编辑器、命令行工具、lint 规则、`bird.config.json`、语言服务器与内部实现，提供简体中文与英文两种语言。

- [入口与 include](https://bird-chinese-community.github.io/zh-cn/configuration/entries-and-includes/) 与 [配置参考](https://bird-chinese-community.github.io/zh-cn/configuration/reference/)
- [VS Code 设置](https://bird-chinese-community.github.io/zh-cn/editors/vscode/#settings) 与 [LSP 用法参考](https://bird-chinese-community.github.io/zh-cn/editors/language-server/)
- [常见问题](https://bird-chinese-community.github.io/zh-cn/faq/)
- BIRD 用户手册：[BIRD 2](https://bird.network.cz/?get_doc&f=bird.html&v=20)、[BIRD 3](https://bird.network.cz/?get_doc&f=bird.html&v=30)

## 反馈

- [报告 bug](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml)
- [提出功能需求](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=feature-request.yml)
- [报告安全问题](./SECURITY.md)

## 许可证

[GPL-3.0-only](./LICENSE)。BIRD-LSP 由 BIRD 中文社区（BIRDCC）维护。BIRD 由 CZ.NIC Labs 开发，本项目与 CZ.NIC 没有隶属关系。

## 鸣谢

<!-- prettier-ignore-start -->

<!-- CI START -->
我们衷心感谢这些上游仓库提供的真实世界 BIRD 配置示例；它们帮助本项目持续验证解析、格式化、Lint 与编辑器支持能力：

- [`PoemaIX/IX-BIRD-RS-Generator`](https://github.com/PoemaIX/IX-BIRD-RS-Generator)
- [`HuJK-Data/JKNET-BIRD`](https://github.com/HuJK-Data/JKNET-BIRD)
- [`@LaunchPad-Network`](https://github.com/LaunchPad-Network) *(private feed)*
- [`186526/net186-config`](https://github.com/186526/net186-config)
- [`SunyzNET/bird-config`](https://github.com/SunyzNET/bird-config)
- [`tianshome/bird-configs-output`](https://github.com/tianshome/bird-configs-output)
<!-- CI END -->

<!-- prettier-ignore-end -->
