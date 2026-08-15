<div align="center">

# 🕊 BIRD Config LSP (@birdcc/lsp)

</div>

<div align="center">

> ⚠️ **Alpha Stage**: This package is in early development. APIs may change frequently, and unexpected issues may occur. Please evaluate carefully before deploying in production environments.

</div>

[![npm version](https://img.shields.io/badge/version-0.1.0--alpha-blue)](https://www.npmjs.com/package/@birdcc/lsp) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript)](https://www.typescriptlang.org/) [![VSCode-languageserver](https://img.shields.io/badge/vscode--languageserver-powered-9f5ec2)](https://github.com/microsoft/vscode-languageserver-node)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Editor Integration](#editor-integration) · [API Reference](#api-reference) · [Architecture](#architecture)

## Overview

**@birdcc/lsp** is the Language Server Protocol implementation for BIRD2 configuration files, delivering real-time diagnostics, intelligent code completion, hover tooltips, and more for editor integration.

| Package       | Version | Description                                          |
| ------------- | ------- | ---------------------------------------------------- |
| `@birdcc/lsp` | 0.1.0   | LSP server implementation with real-time diagnostics |

---

## Features

### LSP Capabilities

- **Incremental Synchronization** — `TextDocumentSyncKind.Incremental` for efficient handling of large files
- **Real-time Diagnostics** — Automatic validation on document open and modification
- **Code Completion** — Auto-completion for keywords, symbols, and snippets
- **Hover Information** — Type information and documentation on hover
- **Go to Definition** — Navigate to symbol definitions
- **Find References** — Find all references to a symbol
- **Document Symbols** — Outline view for quick navigation

### Protocol Features

- **Standard LSP** — Full protocol support powered by `vscode-languageserver`
- **Diagnostic Push** — Server-initiated diagnostic updates
- **Workspace Folders** — Multi-root workspace support

---

## Installation

```bash
# Using pnpm (recommended)
pnpm add @birdcc/lsp

# Using npm
npm install @birdcc/lsp

# Using yarn
yarn add @birdcc/lsp
```

---

## Usage

### Start LSP Server

```bash
# stdio mode (for editor integration)
npx birdcc lsp --stdio
```

### Programmatic Usage

```typescript
import { startLspServer, toLspDiagnostic } from "@birdcc/lsp";
import type { BirdDiagnostic } from "@birdcc/core";

// Start the LSP server
startLspServer();

// Convert internal diagnostic to LSP format
const lspDiagnostic = toLspDiagnostic(birdDiagnostic);
```

---

## Editor Integration

### Visual Studio Code

```json
// settings.json
{
  "bird-lsp.enable": true,
  "bird-lsp.path": "./node_modules/.bin/birdcc",
  "bird-lsp.validateWithBird": true
}
```

### Neovim

```lua
-- init.lua with nvim-lspconfig
local lspconfig = require("lspconfig")
local configs = require("lspconfig.configs")

if not configs.birdcc then
  configs.birdcc = {
    default_config = {
      cmd = { "npx", "birdcc", "lsp", "--stdio" },
      filetypes = { "bird", "conf" },
      root_dir = lspconfig.util.root_pattern(".git", "bird.conf"),
      single_file_support = true,
    },
  }
end

lspconfig.birdcc.setup({})
```

### Helix

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

## API Reference

### Exports

```typescript
import { startLspServer, toLspDiagnostic, createConnection } from "@birdcc/lsp";
```

### `startLspServer(): void`

Start the LSP server with stdio transport.

### `toLspDiagnostic(diagnostic: BirdDiagnostic): Diagnostic`

Convert a BIRD diagnostic to LSP Diagnostic format.

### Types

```typescript
interface LspOptions {
  connection?: Connection;
  documents?: TextDocuments<TextDocument>;
}
```

---

## Architecture

### Layered Architecture

```mermaid
flowchart TB
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0
    classDef adapter fill:#f3e8fd,stroke:#9334e6,stroke-width:1.5px,color:#6c1f9e
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef core fill:#e6f4ea,stroke:#137333,stroke-width:1.5px,color:#0d652d
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14

    subgraph editor [Editor Layer]
        E1[VS Code]
        E2[Neovim]
        E3[Vim]
        E4[Helix]
    end

    subgraph protocol [LSP Protocol]
        LSP[LSP Protocol<br/>JSON-RPC]
    end

    subgraph server [LSP Server]
        S["@birdcc/lsp"]
    end

    subgraph service [Service Layer]
        LINTER["@birdcc/linter<br/>Static Analysis"]
        FORMATTER["@birdcc/formatter"]
        INTEL["@birdcc/intel<br/>ASN Intelligence"]
    end

    subgraph core [Core Layer]
        CORE["@birdcc/core<br/>Symbols / Types"]
    end

    subgraph parser [Parser Layer]
        PARSER["@birdcc/parser<br/>Tree-sitter"]
    end

    E1 --> LSP
    E2 --> LSP
    E3 --> LSP
    E4 --> LSP
    LSP --> S
    S --> LINTER
    S --> FORMATTER
    S --> INTEL
    FORMATTER --> PARSER
    CORE --> PARSER

    class E1,E2,E3,E4 ui
    class LSP,S adapter
    class LINTER,FORMATTER,INTEL service
    class CORE core
    class PARSER infra
```

### LSP Server Modules

```mermaid
flowchart TB
    classDef adapter fill:#f3e8fd,stroke:#9334e6,stroke-width:1.5px,color:#6c1f9e
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef core fill:#e6f4ea,stroke:#137333,stroke-width:1.5px,color:#0d652d

    subgraph server [LSP Server]
        S["@birdcc/lsp"]
        SYNC[TextDocuments<br/>Incremental Sync]
        VALID[Validation Scheduler]
        COMP[Completion]
        HOVER[Hover]
        DEF[Definition]
        REF[References]
        SYMBOLS[Document Symbols]
        INLAY[Inlay Hints<br/>Type / ASN]
    end

    S --> SYNC
    S --> VALID
    S --> COMP
    S --> HOVER
    S --> DEF
    S --> REF
    S --> SYMBOLS
    S --> INLAY

    VALID --> LINTER["@birdcc/linter"]
    VALID --> CORE["@birdcc/core"]
    COMP --> CORE
    HOVER --> CORE
    DEF --> CORE
    REF --> CORE
    SYMBOLS --> CORE
    INLAY --> INTEL["@birdcc/intel"]

    class SYNC,VALID,COMP,HOVER,DEF,REF,SYMBOLS,INLAY adapter
    class LINTER,INTEL service
    class CORE core
```

### Request Handling Flow

```mermaid
sequenceDiagram
    participant Editor as Editor
    participant LSP as LSP Connection
    participant Server as @birdcc/lsp
    participant Scheduler as Validation Scheduler
    participant Linter as @birdcc/linter
    participant Core as @birdcc/core

    Editor->>LSP: Initialize Request
    LSP->>Server: onInitialize()
    Server-->>LSP: ServerCapabilities
    LSP-->>Editor: Initialize Result

    Editor->>LSP: textDocument/didOpen
    LSP->>Server: onDidOpen()
    Server->>Scheduler: schedule(document)
    Scheduler->>Linter: lintBirdConfig(context)
    Scheduler->>Core: resolveCrossFileReferences(graph)
    Linter-->>Scheduler: Diagnostics[]
    Scheduler-->>Server: publishDiagnostics
    Server->>LSP: textDocument/publishDiagnostics
    LSP->>Editor: Diagnostics

    Editor->>LSP: textDocument/completion
    LSP->>Server: onCompletion()
    Server->>Server: createCompletionItemsFromParsed(parsed)
    Server-->>LSP: CompletionItem[]
    LSP-->>Editor: Completions

    Editor->>LSP: textDocument/hover
    LSP->>Server: onHover()
    Server->>Server: createHoverFromParsed(parsed, position)
    Server-->>LSP: Hover
    LSP-->>Editor: Tooltip
```

### Document Synchronization

```mermaid
flowchart LR
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0
    classDef adapter fill:#f3e8fd,stroke:#9334e6,stroke-width:1.5px,color:#6c1f9e
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00

    subgraph editor [Editor]
        E[Document Changes]
    end

    subgraph server [LSP Server]
        S[TextDocuments]
        AST[AST Cache]
        SYM[Symbol Table]
    end

    subgraph validation [Validation]
        V[Validation Scheduler]
        D[Diagnostics Engine]
    end

    E -->|didChange / didOpen / didClose| S
    S -->|parse| AST
    AST -->|analyze| SYM
    SYM -->|validate| V
    V -->|report| D
    D -->|publishDiagnostics| E

    class E ui
    class S,AST,SYM adapter
    class V,D service
```

### Server Capabilities

| Capability               | Status      |
| ------------------------ | ----------- |
| `textDocumentSync`       | Incremental |
| `documentSymbolProvider` | ✅          |
| `hoverProvider`          | ✅          |
| `definitionProvider`     | ✅          |
| `referencesProvider`     | ✅          |
| `completionProvider`     | ✅          |

---

## Related Packages

| Package                            | Description                    |
| ---------------------------------- | ------------------------------ |
| [@birdcc/parser](../parser/)       | Tree-sitter grammar and parser |
| [@birdcc/core](../core/)           | Semantic analysis engine       |
| [@birdcc/linter](../linter/)       | 32+ lint rules                 |
| [@birdcc/formatter](../formatter/) | Code formatting engine         |
| [@birdcc/cli](../cli/)             | Command-line interface         |

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
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
