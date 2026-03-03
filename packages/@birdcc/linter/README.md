<div align="center">

# 🧩 BIRD Config Linter (@birdcc/linter)

</div>

[![npm version](https://img.shields.io/badge/version-0.1.0--alpha-blue)](https://www.npmjs.com/package/@birdcc/linter) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript)](https://www.typescriptlang.org/)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Rules](#rules) · [API Reference](#api-reference)

## Overview

**@birdcc/linter** is the rule engine layer of the BIRD-LSP toolchain, providing a pluggable lint rule system for checking protocol compliance, security, and performance issues in BIRD2 configuration files.

---

## Features

- 🧩 **Pluggable Rules** — Flexible rule system based on the `BirdRule` type
- 🌐 **Protocol Rules** — BGP/OSPF configuration completeness checks
- 🔒 **Security Rules** — Configuration security best practices
- ⚡ **Performance Rules** — Performance optimization recommendations
- 🔍 **32+ Built-in Rules** — Comprehensive coverage of common issues

---

## Installation

```bash
# Using pnpm (recommended)
pnpm add @birdcc/linter

# Using npm
npm install @birdcc/linter

# Using yarn
yarn add @birdcc/linter
```

---

## Usage

### Basic Linting

```typescript
import { lintBirdConfig } from "@birdcc/linter";

const config = `
protocol bgp example {
  neighbor 192.168.1.1 as 65001;
}
`;

const result = lintBirdConfig(config);

console.log(result.diagnostics);
// [{ code: "bgp/missing-local-as", message: "BGP protocol missing local as configuration", severity: "warning" }]
```

### Reference Samples Sync

```bash
pnpm --filter @birdcc/linter sync:examples
```

This command copies `refer/vscode-bird2/syntaxes/bird-tm-grammar/sample/*.conf`
to `packages/@birdcc/linter/examples/` and runs automatically during `build`
and `test`.

### Custom Rules

```typescript
import type { BirdRule, BirdDiagnostic } from "@birdcc/linter";

const namingConventionRule: BirdRule = ({ core }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const symbol of core.symbols) {
    if (symbol.kind === "protocol") {
      if (!/^[a-z][a-z0-9-]*$/.test(symbol.name)) {
        diagnostics.push({
          code: "structure/invalid-protocol-name",
          message: `Protocol name '${symbol.name}' should only contain lowercase letters, numbers, and hyphens`,
          severity: "warning",
          source: "linter",
          range: {
            /* ... */
          },
        });
      }
    }
  }

  return diagnostics;
};
```

---

## Rules

### Symbol Rules (`sym/*`)

| Rule                      | Description                   | Level |
| ------------------------- | ----------------------------- | ----- |
| `sym/undefined`           | Reference to undefined symbol | error |
| `sym/duplicate`           | Duplicate symbol definition   | error |
| `sym/proto-type-mismatch` | Protocol type mismatch        | error |

### Config Rules (`cfg/*`)

| Rule                     | Description              | Level |
| ------------------------ | ------------------------ | ----- |
| `cfg/no-protocol`        | No protocol defined      | error |
| `cfg/missing-router-id`  | Missing router id        | error |
| `cfg/syntax-error`       | Syntax error detected    | error |
| `cfg/value-out-of-range` | Value out of valid range | error |

### Network Rules (`net/*`)

| Rule                        | Description           | Level |
| --------------------------- | --------------------- | ----- |
| `net/invalid-prefix-length` | Invalid prefix length | error |
| `net/invalid-ipv4-prefix`   | Invalid IPv4 prefix   | error |
| `net/invalid-ipv6-prefix`   | Invalid IPv6 prefix   | error |

### Type Rules (`type/*`)

| Rule                | Description          | Level |
| ------------------- | -------------------- | ----- |
| `type/mismatch`     | Type mismatch        | error |
| `type/not-iterable` | Non-iterable in loop | error |

### BGP Rules (`bgp/*`)

| Rule                    | Description        | Level   |
| ----------------------- | ------------------ | ------- |
| `bgp/missing-local-as`  | Missing local AS   | warning |
| `bgp/missing-neighbor`  | Missing neighbor   | warning |
| `bgp/missing-remote-as` | Missing remote AS  | warning |
| `bgp/as-mismatch`       | AS number mismatch | warning |

### OSPF Rules (`ospf/*`)

| Rule                 | Description                | Level   |
| -------------------- | -------------------------- | ------- |
| `ospf/missing-area`  | Missing area configuration | warning |
| `ospf/backbone-stub` | Stub area on backbone      | warning |

---

## API Reference

### `lintBirdConfig(text: string, options?): LintResult`

Perform complete lint checks (semantic analysis + rule checks).

```typescript
import { lintBirdConfig } from "@birdcc/linter";

const result = lintBirdConfig(birdConfigText);
// result.parsed      → Parsed AST
// result.core        → Semantic analysis snapshot
// result.diagnostics → All diagnostic messages
```

### Types

```typescript
interface LintResult {
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
  diagnostics: BirdDiagnostic[];
}

type BirdRule = (context: RuleContext) => BirdDiagnostic[];

interface RuleContext {
  text: string;
  parsed: ParsedBirdDocument;
  core: CoreSnapshot;
}
```

---

## Related Packages

| Package                            | Description                    |
| ---------------------------------- | ------------------------------ |
| [@birdcc/parser](../parser/)       | Tree-sitter grammar and parser |
| [@birdcc/core](../core/)           | Semantic analysis engine       |
| [@birdcc/formatter](../formatter/) | Code formatting engine         |
| [@birdcc/lsp](../lsp/)             | LSP server implementation      |
| [@birdcc/cli](../cli/)             | Command-line interface         |

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
