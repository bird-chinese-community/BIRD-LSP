<div align="center">

# 🕊 BIRD2 LSP Project

</div>

<p align="center">
  <strong>Modern Language Server Protocol support for BIRD2 configuration files</strong>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/releases">
    <img src="https://img.shields.io/badge/version-0.1.0--alpha-blue.svg?style=flat-square" alt="Version" />
  </a>
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-GPL%203.0-green.svg?style=flat-square" alt="License" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/typescript-5.9+-3178c6.svg?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://www.npmjs.com/package/@birdcc/cli">
    <img src="https://img.shields.io/npm/v/@birdcc/cli?style=flat-square&logo=npm&color=cb3837" alt="npm" />
  </a>
</p>

<div align="center">

English Version | [中文文档](./README.zh.md)

</div>

> [Overview](#overview) · [Features](#features) · [Quick Start](#quick-start) · [Packages](#packages) · [Architecture](#architecture) · [Development](#development)

---

## Overview

**BIRD-LSP** is a modern toolchain for [BIRD2](https://bird.network.cz/) configuration files, providing Language Server Protocol (LSP) support, code formatting, and static analysis.

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
    participant LSP as "@birdcc/lsp"
    participant Linter as "@birdcc/linter"
    participant Formatter as "@birdcc/formatter"
    participant Parser as "@birdcc/parser"
    participant Core as "@birdcc/core"

    rect rgb(225, 245, 254)
        Note over Editor,Core: Real-time Diagnostics Flow
        Editor->>+LSP: textDocument/didChange
        LSP->>+Parser: parseBirdConfig(source)
        Parser-->>-LSP: ParsedBirdDocument
        LSP->>+Core: buildCoreSnapshot(parsed)
        Core-->>-LSP: CoreSnapshot
        LSP->>+Linter: lintBirdConfig(context)
        Linter-->>-LSP: Diagnostics[]
        LSP-->>-Editor: textDocument/publishDiagnostics
    end

    rect rgb(255, 243, 224)
        Note over Editor,Core: Formatting Flow
        Editor->>+LSP: textDocument/formatting
        LSP->>+Formatter: formatBirdConfig(source)
        Formatter->>+Parser: parseBirdConfig(source)
        Parser-->>-Formatter: AST
        Formatter-->>-LSP: Formatted Text
        LSP-->>-Editor: TextEdit[]
    end
```

### Package Dependency Graph

```mermaid
flowchart BT
    classDef infra fill:#fce4ec,stroke:#ad1457,stroke-width:2px,color:#000
    classDef core fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px,color:#000
    classDef service fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,color:#000
    classDef lsp fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef user fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#000

    subgraph Infrastructure [Infrastructure Layer]
        PARSER("@birdcc/parser<br/>Tree-sitter/WASM")
        DPRINT("@birdcc/dprint-plugin-bird<br/>🦀 Rust")
    end

    subgraph CoreLayer [Core Layer]
        CORE("@birdcc/core<br/>Symbol Table & Type System")
    end

    subgraph ServiceLayer [Service Layer]
        FORMATTER("@birdcc/formatter<br/>Formatting Engine")
        LINTER("@birdcc/linter<br/>Config Static Analysis Engine")
    end

    subgraph LspLayer [LSP Adapter Layer]
        LSP_SERVER("@birdcc/lsp<br/>Language Server Protocol")
    end

    subgraph UserLayer [User Interface Layer]
        CLI("@birdcc/cli<br/>Command Line")
        VSCODE("@birdcc/vscode<br/>Editor Extension")
    end


    %% Infrastructure supports Formatter (Dprint as underlying engine)
    PARSER <--> DPRINT
    PARSER <--> CORE

    CORE --> FORMATTER
    DPRINT --> FORMATTER

    %% Core and Formatter support Linter
    CORE --> LINTER
    FORMATTER --> LINTER

    %% All services support LSP
    FORMATTER --> LSP_SERVER
    LINTER --> LSP_SERVER

    %% LSP and standalone services support user interfaces
    LSP_SERVER --> CLI
    LSP_SERVER --> VSCODE
    LINTER --> CLI
    FORMATTER --> CLI

    class PARSER,DPRINT infra
    class CORE core
    class FORMATTER,LINTER service
    class LSP_SERVER lsp
    class CLI,VSCODE user
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

<p align="center">
  <sub>Built with ❤️ by the BIRD Chinese Community (BIRDCC)</sub>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP">🕊 GitHub</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">🛒 Marketplace</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/issues">🐛 Report Issues</a>
</p>
