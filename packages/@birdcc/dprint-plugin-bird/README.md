<div align="center">

# 🔧 dprint Plugin for BIRD Config (@birdcc/dprint-plugin-bird)

</div>

<div align="center">

> ⚠️ **Alpha Stage**: This package is in early development. APIs may change frequently, and unexpected issues may occur. Please evaluate carefully before deploying in production environments.

</div>

[![npm version](https://img.shields.io/npm/v/@birdcc/dprint-plugin-bird.svg)](https://www.npmjs.com/package/@birdcc/dprint-plugin-bird) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/) [![WASM](https://img.shields.io/badge/WASM-wasm32--wasip1-purple.svg)](https://webassembly.org/)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Configuration](#configuration) · [Architecture](#architecture) · [Development](#development)

## Overview

**@birdcc/dprint-plugin-bird** is the official dprint plugin for BIRD Internet Routing Daemon (BIRD2) configuration files. Built with Rust and compiled to WebAssembly, it delivers blazing-fast, cross-platform code formatting.

This plugin is part of the [BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP) toolchain, providing enterprise-grade formatting capabilities for network engineers.

---

## Features

| Feature                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| 🚀 **Rust Performance**    | Core engine written in Rust for maximum speed     |
| 🌍 **Cross-Platform WASM** | Compiled to wasm32-wasip1 for consistent behavior |
| 🔌 **dprint Compatible**   | Seamlessly integrates with dprint CLI and editors |
| 🌳 **Tree-sitter**         | Leverages Tree-sitter for syntax-aware formatting |
| ⚙️ **Configurable**        | Supports `lineWidth`, `indentWidth`, `safeMode`   |
| 🦀 **Memory Safe**         | Rust's ownership model guarantees safety          |

---

## Installation

### Prerequisites

- **Rust** ≥ 1.70
- **wasm32-wasip1** target
- **Node.js** ≥ 20

### Setup Rust WASM Target

```bash
rustup target add wasm32-wasip1
```

### Install via npm

```bash
npm install @birdcc/dprint-plugin-bird
```

---

## Usage

### With dprint CLI

Add to your `dprint.json`:

```json
{
  "plugins": [
    "https://npmjs.com/@birdcc/dprint-plugin-bird/dprint-plugin-bird.wasm"
  ],
  "bird": {
    "lineWidth": 100,
    "indentWidth": 2,
    "safeMode": true
  }
}
```

Then run:

```bash
dprint fmt bird.conf
dprint check bird.conf
```

### Via @birdcc/formatter

When configured with `engine: "dprint"`, this plugin is automatically used:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "formatter": {
    "engine": "dprint",
    "indentSize": 2,
    "lineWidth": 100,
    "safeMode": true
  }
}
```

### Programmatic Usage

```typescript
import { getPath, getBuffer } from "@birdcc/dprint-plugin-bird";

// Get WASM file path
const wasmPath = getPath();

// Or get WASM buffer directly
const wasmBuffer = getBuffer();
```

---

## Configuration

### Options

| Option        | Type      | Default | Description                        |
| ------------- | --------- | ------- | ---------------------------------- |
| `lineWidth`   | `number`  | `80`    | Maximum line length                |
| `indentWidth` | `number`  | `2`     | Spaces per indentation level       |
| `safeMode`    | `boolean` | `true`  | Enable safe mode to prevent errors |

---

## Architecture

### Plugin Architecture

```mermaid
flowchart TB
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0

    subgraph host [Host Environment]
        D1[dprint CLI]
        D2[Editor Plugin]
        D3["@birdcc/formatter"]
    end

    subgraph wasm [WASM Runtime]
        WASM[WASM Module<br/>wasm32-wasip1]
        TRAIT[Plugin Trait<br/>plugin_info / resolve_config]
    end

    subgraph rust [Rust Core]
        FORMAT[format_text]
        CONFIG[resolve_config]
    end

    subgraph parse [Parsing]
        P1[Tree-sitter Parser]
        AST[AST Builder]
    end

    subgraph layout [Formatting]
        LAYOUT[Layout Engine<br/>indent / line-break]
    end

    subgraph output [Output]
        OUT[Formatted Text]
    end

    D1 --> WASM
    D2 --> WASM
    D3 --> WASM
    WASM --> TRAIT
    TRAIT --> FORMAT
    TRAIT --> CONFIG
    FORMAT --> P1
    P1 --> AST
    AST --> LAYOUT
    LAYOUT --> OUT

    class D1,D2,D3 ui
    class WASM,TRAIT,FORMAT,CONFIG,P1,AST infra
    class LAYOUT service
    class OUT ui
```

### Data Flow

```mermaid
sequenceDiagram
    participant Host as dprint Host
    participant WASM as WASM Runtime
    participant Plugin as BIRD Plugin
    participant Parser as Tree-sitter
    participant Layout as Layout Engine

    Host->>WASM: load plugin (wasm)
    WASM->>Plugin: plugin_info()
    Plugin-->>WASM: PluginInfo
    Host->>WASM: resolve_config(config)
    WASM-->>Host: resolved config

    Host->>WASM: format(file_text, config)
    WASM->>Plugin: format()
    Plugin->>Parser: parse_source()
    Parser-->>Plugin: CST/AST
    Plugin->>Layout: layout(cst, config)
    Layout-->>Plugin: formatted text
    Plugin-->>WASM: result
    WASM-->>Host: formatted output
```

### Build Pipeline

```mermaid
flowchart LR
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0

    subgraph source [Source]
        RS[Rust Source<br/>src/*.rs]
        TS[TypeScript<br/>src/*.ts]
    end

    subgraph compile [Compile]
        RUSTC[Rust Compiler]
        TSC[TypeScript Compiler]
    end

    subgraph output [Output]
        WASM[dprint-plugin-bird.wasm]
        JS[index.js]
        DTS[index.d.ts]
    end

    subgraph pkg [Package]
        PKG[npm Package]
    end

    RS --> RUSTC
    TS --> TSC
    RUSTC --> WASM
    TSC --> JS
    TSC --> DTS
    WASM --> PKG
    JS --> PKG
    DTS --> PKG

    class RS,TS ui
    class RUSTC,TSC,WASM,JS,DTS infra
    class PKG service
```

---

## Development

### Build

Execute from the monorepo root:

```bash
pnpm build
```

This command performs:

1. Compiles Rust code to WebAssembly (`wasm32-wasip1`)
2. Generates TypeScript declaration files
3. Outputs to the `dist/` directory

### Manual Build Steps

```bash
# Build WASM
node scripts/build-wasm.mjs

# Compile TypeScript
tsc -p tsconfig.json
```

### Project Structure

| Path                     | Description                    |
| ------------------------ | ------------------------------ |
| `src/lib.rs`             | Library entry point            |
| `src/configuration.rs`   | Configuration structures       |
| `src/format_text.rs`     | Core formatting implementation |
| `src/wasm_plugin.rs`     | WASM bindings                  |
| `src/index.ts`           | TypeScript bindings            |
| `scripts/build-wasm.mjs` | WASM build script              |
| `dist/`                  | Build output directory         |

### Available Scripts

| Command          | Description                  |
| ---------------- | ---------------------------- |
| `pnpm build`     | Build WASM + TypeScript      |
| `pnpm test`      | Run Rust unit tests          |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm lint`      | Run oxlint and cargo clippy  |
| `pnpm format`    | Format code using oxfmt      |

### Testing

```bash
# Run Rust tests
cargo test

# Run with output
cargo test -- --nocapture
```

---

## Relationship with @birdcc/formatter

| Package                      | Role                  | Description                             |
| ---------------------------- | --------------------- | --------------------------------------- |
| `@birdcc/dprint-plugin-bird` | **dprint Plugin**     | Official dprint plugin for BIRD2        |
| `@birdcc/formatter`          | **Abstraction Layer** | Unified interface with multiple engines |

`@birdcc/formatter` serves as a higher-level abstraction that can use this dprint plugin as its backend, while also providing a built-in fallback formatter.

---

## Related Packages

| Package                            | Description                    |
| ---------------------------------- | ------------------------------ |
| [@birdcc/parser](../parser/)       | Tree-sitter grammar and parser |
| [@birdcc/core](../core/)           | Semantic analysis engine       |
| [@birdcc/formatter](../formatter/) | Unified formatting interface   |
| [@birdcc/linter](../linter/)       | Lint rules and diagnostics     |
| [@birdcc/lsp](../lsp/)             | LSP server implementation      |
| [@birdcc/cli](../cli/)             | Command-line interface         |

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
- [dprint Documentation](https://dprint.dev/)
- [GitHub Project](https://github.com/bird-chinese-community/BIRD-LSP)

---

## 📝 License

GPL-3.0-only © [BIRD Chinese Community](https://github.com/bird-chinese-community/)

---

<p align="center">
  <sub>Built with ❤️ by the BIRD Chinese Community (BIRDCC)</sub>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP">🕊 GitHub</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">🛒 Marketplace</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/issues">🐛 Report Issues</a>
</p>
