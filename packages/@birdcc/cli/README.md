<div align="center">

# 🛠️ BIRD Config CLI (@birdcc/cli)

</div>

<div align="center">

> ⚠️ **Alpha Stage**: This package is in early development. APIs may change frequently, and unexpected issues may occur. Please evaluate carefully before deploying in production environments.

</div>

[![npm version](https://img.shields.io/badge/version-0.1.0--alpha-blue)](https://www.npmjs.com/package/@birdcc/cli) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript)](https://www.typescriptlang.org/)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Commands](#commands) · [Usage](#usage) · [Configuration](#configuration) · [API Reference](#api-reference)

## Overview

**@birdcc/cli** is the command-line interface for the BIRD-LSP toolchain, providing lint, format, and LSP commands for BIRD2 configuration files.

| Package       | Version | Description                                       |
| ------------- | ------- | ------------------------------------------------- |
| `@birdcc/cli` | 0.1.0   | Command-line interface with lint/fmt/lsp commands |

---

## Features

- 🔍 **Lint Analysis** — Static analysis combined with BIRD runtime validation
- 🎨 **Code Formatting** — Trim trailing whitespace and collapse excessive blank lines
- 🖥️ **LSP Mode** — Launch the language server in stdio transport mode
- 🔗 **BIRD Integration** — Parse `bird -p` output with multiple error format support
- 📊 **Multiple Output Formats** — Text and JSON output for CI integration

---

## Installation

```bash
# Global installation
npm install -g @birdcc/cli

# Or use npx (no installation required)
npx @birdcc/cli --help
```

### Via Package Manager

```bash
# Using pnpm
pnpm add -D @birdcc/cli

# Using npm
npm install -D @birdcc/cli

# Using yarn
yarn add -D @birdcc/cli
```

---

## Commands

### `birdcc lint [file]` — Code Linting

Check syntax and semantic issues in BIRD2 configuration files.

```bash
birdcc lint [file] [options]
```

**Options:**

| Option               | Type             | Default             | Description                    |
| -------------------- | ---------------- | ------------------- | ------------------------------ |
| `--format`           | `json` \| `text` | `text`              | Output format                  |
| `--bird`             | boolean          | `false`             | Enable BIRD runtime validation |
| `--validate-command` | string           | `bird -p -c {file}` | Custom validation command      |

**Examples:**

```bash
# Text format output
birdcc lint bird.conf

# Use `main` from bird.config.json when file is omitted
birdcc lint

# JSON format output for CI
birdcc lint bird.conf --format json

# Combined with BIRD validation
birdcc lint bird.conf --bird --validate-command "sudo bird -p -c {file}"
```

### `birdcc fmt [file]` — Code Formatting

Format BIRD2 configuration files.

```bash
birdcc fmt [file] [options]
```

**Options:**

| Option    | Type    | Default | Description                              |
| --------- | ------- | ------- | ---------------------------------------- |
| `--check` | boolean | `false` | Check format only without modifying file |
| `--write` | boolean | `false` | Write formatted content to file          |

**Examples:**

```bash
# Check formatting
birdcc fmt bird.conf --check

# Check formatting for `main` from bird.config.json
birdcc fmt --check

# Format and write
birdcc fmt bird.conf --write
```

### `birdcc lsp` — Language Server

Start the LSP server process.

```bash
birdcc lsp [options]
```

**Options:**

| Option    | Type    | Required | Description         |
| --------- | ------- | -------- | ------------------- |
| `--stdio` | boolean | ✓        | Use stdio transport |

**Example:**

```bash
birdcc lsp --stdio
```

---

## Usage

### Quick Start

```bash
# Lint check (text output)
npx birdcc lint bird.conf

# Lint `main` from bird.config.json
npx birdcc lint

# Lint check (JSON output for CI integration)
npx birdcc lint bird.conf --format json

# Combined with BIRD runtime validation
npx birdcc lint bird.conf --bird

# Format check
npx birdcc fmt bird.conf --check

# Format check for `main` from bird.config.json
npx birdcc fmt --check

# Format and write to file
npx birdcc fmt bird.conf --write

# Start LSP server
npx birdcc lsp --stdio
```

---

## Configuration

### bird.config.json

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "bird": {
    "validateCommand": "sudo bird -p -c {file}"
  },
  "formatter": {
    "engine": "dprint",
    "indentSize": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "sym/*": "error",
      "bgp/*": "warning"
    }
  }
}
```

### Supported Error Formats

`@birdcc/cli` supports parsing the following BIRD error output formats:

| Format      | Example                                              |
| ----------- | ---------------------------------------------------- |
| Standard    | `bird.conf:15:8 syntax error, unexpected 'protocol'` |
| Parse Error | `Parse error bird.conf, line 15: syntax error`       |
| Legacy      | `bird.conf, line 15:8 syntax error`                  |

---

## API Reference

### Exports

```typescript
import {
  runLint,
  runFmt,
  runLspStdio,
  runBirdValidation,
  formatBirdConfigText,
  parseBirdStderr,
} from "@birdcc/cli";
```

### Functions

| Function                                | Description                   |
| --------------------------------------- | ----------------------------- |
| `runLint(filePath, options?)`           | Run lint analysis             |
| `runFmt(filePath, options?)`            | Run formatter                 |
| `runLspStdio()`                         | Start LSP server (stdio mode) |
| `runBirdValidation(filePath, command?)` | Run BIRD validation           |
| `formatBirdConfigText(text)`            | Format text (pure function)   |
| `parseBirdStderr(stderr)`               | Parse BIRD stderr output      |

### Type Definitions

```typescript
interface LintOptions {
  withBird?: boolean;
  validateCommand?: string;
  format?: "text" | "json";
}

interface FmtOptions {
  write?: boolean;
  check?: boolean;
}

interface BirdccLintOutput {
  diagnostics: BirdDiagnostic[];
}

interface FmtResult {
  changed: boolean;
  formattedText: string;
}

interface BirdValidateResult {
  command: string;
  exitCode: number;
  stderr: string;
  stdout: string;
  diagnostics: BirdDiagnostic[];
}
```

---

## Related Packages

| Package                            | Description                    |
| ---------------------------------- | ------------------------------ |
| [@birdcc/parser](../parser/)       | Tree-sitter grammar and parser |
| [@birdcc/core](../core/)           | Semantic analysis engine       |
| [@birdcc/linter](../linter/)       | 32+ lint rules                 |
| [@birdcc/formatter](../formatter/) | Code formatting engine         |
| [@birdcc/lsp](../lsp/)             | LSP server implementation      |

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
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
