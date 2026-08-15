<div align="center">

# 🕊 BIRD2 LSP Project

</div>

<p align="center">
  <strong>Modern Language Server Protocol support for BIRD2 configuration files</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">
    <img src="https://img.shields.io/visual-studio-marketplace/v/birdcc.bird2-lsp?style=flat-square&label=VS%20Marketplace&color=007ACC" alt="VS Marketplace Version" />
  </a>
  <a href="https://open-vsx.org/extension/birdcc/bird2-lsp">
    <img src="https://img.shields.io/open-vsx/v/birdcc/bird2-lsp?style=flat-square&label=Open%20VSX&color=C160EF" alt="Open VSX Version" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/typescript-5.9+-3178c6.svg?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://www.npmjs.com/package/@birdcc/cli">
    <img src="https://img.shields.io/npm/v/@birdcc/cli?style=flat-square&logo=npm&color=cb3837" alt="npm" />
  </a>
</p>

<p align="center">
    <a href="https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-GPL%203.0-green.svg?style=flat-square" alt="License" />
  </a>
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/cross-platform-compat.yml">
    <img src="https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/cross-platform-compat.yml/badge.svg" alt="License" />
  </a>
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/sync-config-examples.yml">
    <img src="https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/sync-config-examples.yml/badge.svg" alt="License" />
  </a>
</p>

<div align="center">

> ⚠️ **Development Stage Notice**
>
> | Component                  | Status   | Warning                                                                                     |
> | -------------------------- | -------- | ------------------------------------------------------------------------------------------- |
> | npm packages (`@birdcc/*`) | 🚧 Alpha | APIs may change frequently. Evaluate carefully before production use.                       |
> | VS Code extension          | 🧪 Beta  | More stable than Alpha, but some features may still change. Evaluate before production use. |
>
> **Please evaluate carefully before deploying in production environments.**

English Version | [中文文档](./README.zh.md)

> [Overview](#overview) · [Features](#features) · [Quick Start](#quick-start) · [Packages](#packages) · [Architecture](#architecture) · [Development](#development)

</div>

---

## Overview

**BIRD-LSP** is a modern toolchain for [BIRD2](https://bird.network.cz/) (and BIRD3) configuration files, providing Language Server Protocol (LSP) support, code formatting (Formatter & Parser), and static analysis (Linter).

---

## Features

| Feature                      | Description                                                 |
| ---------------------------- | ----------------------------------------------------------- |
| 🎨 **Syntax Highlighting**   | Tree-sitter based precise parsing                           |
| 🔍 **Real-time Diagnostics** | 32+ lint rules + cross-file analysis + `bird -p` validation |
| 📝 **Code Formatting**       | Dual-engine formatter (dprint + builtin) with safe mode     |
| 💡 **IntelliSense**          | Smart completion for protocols, filters, functions          |
| 🔎 **Hover Information**     | Type info and documentation on hover                        |
| 🏗️ **Symbol Navigation**     | Go to definition, find references (cross-file)              |

---

## Quick Start

### Install CLI

```bash
npm install -g @birdcc/cli
# or
pnpm add -g @birdcc/cli
```

### Usage

```bash
# Lint a BIRD config file
birdcc lint bird.conf

# Format a file
birdcc fmt bird.conf --write

# Start LSP server
birdcc lsp --stdio
```

### VS Code Extension

Search for **"BIRD2 LSP"** in VS Code Marketplace or install from [Open VSX](https://open-vsx.org/extension/birdcc/bird2-lsp).

---

## Packages

| Package                                                              | Version     | Description                  | Documentation                                             |
| -------------------------------------------------------------------- | ----------- | ---------------------------- | --------------------------------------------------------- |
| [@birdcc/parser](./packages/@birdcc/parser/)                         | 0.1.0-alpha | Tree-sitter parser for BIRD2 | [README](./packages/@birdcc/parser/README.md)             |
| [@birdcc/core](./packages/@birdcc/core/)                             | 0.1.0-alpha | Semantic analysis engine     | [README](./packages/@birdcc/core/README.md)               |
| [@birdcc/linter](./packages/@birdcc/linter/)                         | 0.1.0-alpha | Pluggable lint rule system   | [README](./packages/@birdcc/linter/README.md)             |
| [@birdcc/lsp](./packages/@birdcc/lsp/)                               | 0.1.0-alpha | LSP server implementation    | [README](./packages/@birdcc/lsp/README.md)                |
| [@birdcc/formatter](./packages/@birdcc/formatter/)                   | 0.1.0-alpha | Dual-engine code formatter   | [README](./packages/@birdcc/formatter/README.md)          |
| [@birdcc/cli](./packages/@birdcc/cli/)                               | 0.1.0-alpha | Command-line interface       | [README](./packages/@birdcc/cli/README.md)                |
| [@birdcc/vscode](./packages/@birdcc/vscode/)                         | 0.1.0-alpha | VS Code extension            | [README](./packages/@birdcc/vscode/README.md)             |
| [@birdcc/dprint-plugin-bird](./packages/@birdcc/dprint-plugin-bird/) | 0.1.0-alpha | dprint plugin (Rust/WASM)    | [README](./packages/@birdcc/dprint-plugin-bird/README.md) |

---

## Architecture

### Component Interaction

```mermaid
sequenceDiagram
    autonumber
    participant Editor as Editor (VSCode/Neovim)
    participant LSP as @birdcc/lsp
    participant Parser as @birdcc/parser
    participant Core as @birdcc/core
    participant Linter as @birdcc/linter
    participant Formatter as @birdcc/formatter

    Note over Editor,Formatter: Real-time Diagnostics
    Editor->>+LSP: textDocument/didChange
    LSP->>+Parser: parseBirdConfig(source)
    Parser-->>-LSP: ParsedBirdDocument
    LSP->>+Core: buildCoreSnapshot(parsed)
    Core-->>-LSP: CoreSnapshot
    LSP->>+Linter: lintBirdConfig(context)
    Linter-->>-LSP: Diagnostics[]
    LSP-->>-Editor: textDocument/publishDiagnostics

    Note over Editor,Formatter: Formatting
    Editor->>+LSP: textDocument/formatting
    LSP->>+Formatter: formatBirdConfig(source)
    Formatter->>+Parser: parseBirdConfig(source)
    Parser-->>-Formatter: AST
    Formatter-->>-LSP: Formatted Text
    LSP-->>-Editor: TextEdit[]
```

### Package Dependency Graph

```mermaid
flowchart BT
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14
    classDef core fill:#e6f4ea,stroke:#137333,stroke-width:1.5px,color:#0d652d
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef adapter fill:#f3e8fd,stroke:#9334e6,stroke-width:1.5px,color:#6c1f9e
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0

    subgraph infra [Infrastructure Layer]
        PARSER["@birdcc/parser<br/>Tree-sitter / WASM"]
        DPRINT["@birdcc/dprint-plugin-bird<br/>Rust / WASM"]
    end

    subgraph core [Core Layer]
        CORE["@birdcc/core<br/>Symbols / Types / Cross-file"]
    end

    subgraph service [Service Layer]
        LINTER["@birdcc/linter<br/>Static Analysis"]
        FORMATTER["@birdcc/formatter<br/>Format Engines"]
        INTEL["@birdcc/intel<br/>ASN Intelligence"]
    end

    subgraph adapter [LSP Adapter Layer]
        LSP_SERVER["@birdcc/lsp<br/>Language Server"]
    end

    subgraph ui [Interface Layer]
        CLI["@birdcc/cli"]
        VSCODE["@birdcc/vscode<br/>Editor Extension"]
    end

    DPRINT --> FORMATTER
    PARSER --> FORMATTER
    PARSER --> CORE
    CORE --> FORMATTER
    CORE --> LINTER
    CORE --> INTEL
    CORE --> LSP_SERVER
    LINTER --> LSP_SERVER
    FORMATTER --> LSP_SERVER
    INTEL --> LSP_SERVER
    LSP_SERVER --> CLI
    LSP_SERVER --> VSCODE
    LINTER --> CLI
    FORMATTER --> CLI

    class PARSER,DPRINT infra
    class CORE core
    class LINTER,FORMATTER,INTEL service
    class LSP_SERVER adapter
    class CLI,VSCODE ui
```

---

## Development

```bash
# Clone with submodules
git clone --recursive https://github.com/bird-chinese-community/BIRD-LSP.git
cd BIRD-LSP

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
- [Extension Configuration Guide](./docs/configuration.md)
- [Project Config Spec (`bird.config.json`)](./docs/spec.md)
- [FAQ / Troubleshooting](./docs/faq.md)
- [GitHub Project](https://github.com/bird-chinese-community/BIRD-LSP)

---

## 📝 License

This project is licensed under the [GPL-3.0 License](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE).

---

## 🙏 Acknowledgements

<!-- CI START -->
We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:

- [`PoemaIX/IX-BIRD-RS-Generator`](https://github.com/PoemaIX/IX-BIRD-RS-Generator)
- [`HuJK-Data/JKNET-BIRD`](https://github.com/HuJK-Data/JKNET-BIRD)
- [`@LaunchPad-Network`](https://github.com/LaunchPad-Network) *(private feed)*
- [`186526/net186-config`](https://github.com/186526/net186-config)
- [`SunyzNET/bird-config`](https://github.com/SunyzNET/bird-config)
- [`tianshome/bird-configs-output`](https://github.com/tianshome/bird-configs-output)
<!-- CI END -->

---

<p align="center">
  <sub>Built with ❤️ by the BIRD Chinese Community (BIRDCC)</sub>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP">🕊 GitHub</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">🛒 Marketplace</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/issues">🐛 Report Issues</a>
</p>
