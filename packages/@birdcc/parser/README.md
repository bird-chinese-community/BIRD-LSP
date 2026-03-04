<div align="center">

# 🕊 BIRD Config Parser (@birdcc/parser)

</div>

<div align="center">

> ⚠️ **Alpha Stage**: This package is in early development. APIs may change frequently, and unexpected issues may occur. Please evaluate carefully before deploying in production environments.

</div>

[![npm version](https://img.shields.io/badge/version-0.1.0--alpha-blue)](https://www.npmjs.com/package/@birdcc/parser) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript)](https://www.typescriptlang.org/) [![Tree-sitter](https://img.shields.io/badge/Tree--sitter-powered-9f5ec2)](https://tree-sitter.github.io/)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [API Reference](#api-reference) · [Building](#building)

## Overview

**@birdcc/parser** is a Tree-sitter based parser for BIRD2 configuration files, delivering high-performance syntax analysis and declaration extraction capabilities.

### Core Highlights

| Feature                   | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| 🌲 Tree-sitter Grammar    | Complete BIRD2 grammar definition with error recovery support                     |
| ⚡ WASM Runtime           | WebAssembly runtime powered by `web-tree-sitter` for cross-platform compatibility |
| 🔌 Async API              | Asynchronous parsing interface optimized for server and CLI environments          |
| 📦 Declaration Extraction | Extract top-level declarations and protocol statements for semantic analysis      |
| 🩺 Error Diagnostics      | Automatic syntax error detection with precise source location information         |

---

## Features

### Declaration Extraction

- **`include`** — File inclusion statements
- **`define`** — Macro definitions
- **`router id`** — Router identifier configuration
- **`table`** — Routing table definitions (ipv4/ipv6/vpn4/vpn6/roa4/roa6/flow4/flow6)

### Protocols & Templates

- **`protocol`** — Protocol definitions supporting types like bgp/ospf/static/direct
- **`template`** — Protocol template definitions
- **Template Inheritance** — Support for template inheritance via the `from` clause

### Protocol Statements

- **`local as`** — Local AS number configuration
- **`neighbor ... as ...`** — BGP neighbor definition
- **`import`** — Import rules (all/none/filter/where)
- **`export`** — Export rules (all/none/filter/where)

### Channel Statements

- **Types** — ipv4/ipv6/vpn4/vpn6/roa4/roa6/flow4/flow6/mpls
- **`table`** — Associated routing table
- **`import/export`** — Channel-level import/export rules
- **`import limit` / `receive limit`** — Route limit configuration
- **`debug`** — Debug configuration
- **`import keep filtered`** — Retain filtered routes

### Filter & Function Skeleton

- **Control Flow** — `if` / `case` conditional statements
- **Actions** — `accept` / `reject` / `return` routing decisions
- **Literal Extraction** — `ip` / `prefix` literals for semantic validation
- **Match Expressions** — Pattern matching with the `~` operator

### Error Diagnostics

- **ERROR Nodes** — Tree-sitter syntax errors with complete source ranges
- **MISSING Nodes** — Missing symbol detection (e.g., missing semicolons)
- **Brace Balancing** — Automatic detection of unbalanced braces

---

## Installation

```bash
# Using pnpm (recommended)
pnpm add @birdcc/parser

# Using npm
npm install @birdcc/parser

# Using yarn
yarn add @birdcc/parser
```

### Prerequisites

- Node.js >= 18
- TypeScript >= 5.0 (if using TypeScript)

---

## Usage

### Basic Parsing

```typescript
import { parseBirdConfig } from "@birdcc/parser";

const source = `
protocol bgp edge {
  local as 65001;
  neighbor 192.0.2.1 as 65002;
  import all;
  export filter policy_out;
  
  ipv4 {
    table bgp_v4;
    import limit 1000 action restart;
  };
}
`;

const result = await parseBirdConfig(source);

// View extracted declarations
console.log(result.program.declarations);

// View diagnostic issues
console.log(result.issues);
```

### Handling Errors

```typescript
import { parseBirdConfig } from "@birdcc/parser";

const result = await parseBirdConfig(source);

if (result.issues.length > 0) {
  for (const issue of result.issues) {
    console.error(
      `[${issue.code}] Line ${issue.line}:${issue.column} - ${issue.message}`,
    );
  }
}

// Even with errors, the result contains processable declarations
console.log(`Found ${result.program.declarations.length} declarations`);
```

### Extract Protocol Details

```typescript
import { parseBirdConfig } from "@birdcc/parser";

const result = await parseBirdConfig(source);

for (const decl of result.program.declarations) {
  if (decl.kind === "protocol") {
    console.log(`Protocol: ${decl.name} (${decl.protocolType})`);

    for (const stmt of decl.statements) {
      if (stmt.kind === "local-as") {
        console.log(`  Local AS: ${stmt.asn}`);
      }
      if (stmt.kind === "neighbor") {
        console.log(`  Neighbor: ${stmt.address} AS ${stmt.asn}`);
      }
    }
  }
}
```

---

## API Reference

### Main Function

```typescript
function parseBirdConfig(input: string): Promise<ParsedBirdDocument>;
```

Parses BIRD configuration content and returns the parsing result along with diagnostic information.

**Parameters:**

- `input: string` — Configuration file content

**Returns:** `Promise<ParsedBirdDocument>` — Parsing result object

### Core Types

#### `ParsedBirdDocument`

```typescript
interface ParsedBirdDocument {
  program: BirdProgram; // Parsed program structure
  issues: ParseIssue[]; // Diagnostic issues
}
```

#### `BirdDeclaration`

Union type of declaration kinds:

| Type                  | Description                 |
| --------------------- | --------------------------- |
| `IncludeDeclaration`  | `include "file.conf";`      |
| `DefineDeclaration`   | `define MACRO = value;`     |
| `RouterIdDeclaration` | `router id 192.0.2.1;`      |
| `TableDeclaration`    | `table bgp_v4;`             |
| `ProtocolDeclaration` | `protocol bgp name { ... }` |
| `TemplateDeclaration` | `template bgp base { ... }` |
| `FilterDeclaration`   | `filter name { ... }`       |
| `FunctionDeclaration` | `function name() { ... }`   |

#### `ParseIssue`

```typescript
interface ParseIssue {
  code:
    | "syntax/missing-semicolon"
    | "syntax/unbalanced-brace"
    | "parser/missing-symbol"
    | "parser/syntax-error"
    | "parser/runtime-error";
  message: string;
  line: number; // Start line (1-based)
  column: number; // Start column (1-based)
  endLine: number; // End line
  endColumn: number; // End column
}
```

---

## Building

### Development Build

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm --filter @birdcc/parser run build

# Run tests
pnpm --filter @birdcc/parser run test

# Type check
pnpm --filter @birdcc/parser run typecheck
```

### WASM Build

```bash
# Regenerate grammar files
pnpm --filter @birdcc/parser run build:grammar

# Build WASM runtime (requires Emscripten or Docker)
pnpm --filter @birdcc/parser run build:wasm
```

### File Structure

**Tracked Files (in Git):**

| File                          | Description                    |
| ----------------------------- | ------------------------------ |
| `grammar.js`                  | Tree-sitter grammar definition |
| `src/tree-sitter-birdcc.wasm` | WASM runtime binary            |
| `src/*.ts`                    | TypeScript source files        |

**Generated Files (not tracked):**

| File                  | Description           |
| --------------------- | --------------------- |
| `src/parser.c`        | Generated C parser    |
| `src/grammar.json`    | Serialized grammar    |
| `src/node-types.json` | Node type definitions |

---

## Related Packages

| Package                                    | Description                             |
| ------------------------------------------ | --------------------------------------- |
| [@birdcc/core](../@birdcc/core/)           | AST, symbol table, and type checker     |
| [@birdcc/linter](../@birdcc/linter/)       | 32+ lint rules and diagnostics          |
| [@birdcc/lsp](../@birdcc/lsp/)             | Language Server Protocol implementation |
| [@birdcc/formatter](../@birdcc/formatter/) | Code formatter                          |
| [@birdcc/cli](../@birdcc/cli/)             | Command-line interface                  |

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
- [Extension Configuration Guide](./docs/configuration.md)
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
