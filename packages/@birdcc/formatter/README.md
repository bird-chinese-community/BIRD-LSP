<div align="center">

# 🎨 BIRD Config Formatter (@birdcc/formatter)

</div>

<div align="center">

> ⚠️ **Alpha Stage**: This package is in early development. APIs may change frequently, and unexpected issues may occur. Please evaluate carefully before deploying in production environments.

</div>

[![npm version](https://img.shields.io/badge/version-0.1.0--alpha-blue)](https://www.npmjs.com/package/@birdcc/formatter) [![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0--only-green.svg)](https://www.gnu.org/licenses/gpl-3.0) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript)](https://www.typescriptlang.org/)

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Configuration](#configuration) · [API Reference](#api-reference) · [Architecture](#architecture)

## Overview

**@birdcc/formatter** is the formatting component in the BIRD-LSP toolchain, purpose-built for [BIRD Internet Routing Daemon](https://bird.network.cz/) configuration files. It employs a **dual-engine architecture** combining dprint performance with builtin reliability.

---

## Features

| Feature                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| ⚡ **dprint Engine**     | Rust/WASM-based for lightning-fast formatting     |
| 🛡️ **Builtin Fallback**  | Automatic fallback when dprint is unavailable     |
| 🔒 **Safe Mode**         | AST semantic verification before/after formatting |
| 🔄 **Async API**         | Promise-based interface for modern architectures  |
| 🧩 **Zero Dependencies** | Builtin engine requires no external deps          |

---

## Installation

```bash
# Using pnpm (recommended)
pnpm add @birdcc/formatter

# Using npm
npm install @birdcc/formatter

# Using yarn
yarn add @birdcc/formatter
```

### Prerequisites

- Node.js >= 18
- TypeScript >= 5.0 (if using TypeScript)

---

## Usage

### Basic Formatting

```typescript
import { formatBirdConfig } from "@birdcc/formatter";

const source = `
protocol bgp bgp_peer {
local as 65001;
neighbor 192.0.2.1 as 65002;
}
`;

const formatted = await formatBirdConfig(source, {
  engine: "dprint",
  safeMode: true,
});

console.log(formatted.text);
console.log(`Changed: ${formatted.changed}`);
console.log(`Engine: ${formatted.engine}`);
```

### Format Checking

```typescript
import { checkBirdConfigFormat } from "@birdcc/formatter";

const result = await checkBirdConfigFormat(source);
console.log(`Needs formatting: ${result.changed}`);
```

### Using Builtin Engine

```typescript
const formatted = await formatBirdConfig(source, {
  engine: "builtin",
  indentSize: 4,
  safeMode: true,
});
```

---

## Configuration

### Options

| Option       | Type                      | Default    | Description                       |
| ------------ | ------------------------- | ---------- | --------------------------------- |
| `engine`     | `'dprint'` \| `'builtin'` | `'dprint'` | Formatter engine selection        |
| `safeMode`   | `boolean`                 | `true`     | Enable semantic equivalence check |
| `indentSize` | `number`                  | `2`        | Number of spaces for indentation  |
| `lineWidth`  | `number`                  | `80`       | Maximum line width                |

### Configuration Details

- **`engine`**: `dprint` uses Rust/WASM; `builtin` uses TypeScript as fallback
- **`safeMode`**: Compares AST fingerprints to ensure semantic equivalence
- **`indentSize`**: Indentation spaces (positive integer)
- **`lineWidth`**: Target line width (positive integer)

---

## API Reference

### `formatBirdConfig(text, options?)`

Format BIRD2 configuration file content.

```typescript
import { formatBirdConfig } from "@birdcc/formatter";

const result = await formatBirdConfig(text, options);
// result.text    → Formatted content
// result.changed → Whether changes were made
// result.engine  → Engine used
```

**Parameters:**

- `text: string` — The configuration file content to format
- `options?: FormatBirdConfigOptions` — Formatting options

**Returns:** `Promise<BirdFormatResult>`

### `checkBirdConfigFormat(text, options?)`

Check if the configuration file needs formatting (without actually formatting).

```typescript
import { checkBirdConfigFormat } from "@birdcc/formatter";

const result = await checkBirdConfigFormat(text, options);
// result.changed → Whether formatting is needed
```

### Type Definitions

```typescript
interface FormatBirdConfigOptions {
  engine?: "dprint" | "builtin";
  safeMode?: boolean;
  indentSize?: number;
  lineWidth?: number;
}

interface BirdFormatResult {
  text: string;
  changed: boolean;
  engine: "dprint" | "builtin";
}

interface BirdFormatCheckResult {
  changed: boolean;
}

type FormatterEngine = "dprint" | "builtin";
```

---

## Architecture

### Dual-Engine Architecture

```mermaid
flowchart TB
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef flow fill:#f8f9fa,stroke:#5f6368,stroke-width:1px,color:#3c4043
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0

    subgraph api [API Layer]
        API[formatBirdConfig]
    end

    subgraph selection [Engine Selection]
        SEL{resolveOptions}
    end

    subgraph dprint [dprint Engine]
        D1["@birdcc/dprint-plugin-bird<br/>Rust / WASM"]
        D2[Tree-sitter Parser]
    end

    subgraph builtin [Builtin Engine]
        B1[TypeScript Implementation]
        B2[Parser Adapter]
    end

    subgraph safety [Safety Layer]
        SAFE{assertSafeModeSemanticEquivalence}
        AST1[Parse Original]
        AST2[Parse Formatted]
        CMP[Fingerprint Compare]
    end

    subgraph output [Output]
        OUT[Formatted Text]
    end

    API --> SEL
    SEL -->|dprint| D1
    SEL -->|builtin| B1
    D1 --> D2
    B1 --> B2
    D1 --> SAFE
    B1 --> SAFE
    SAFE -->|enabled| AST1
    SAFE -->|enabled| AST2
    AST1 --> CMP
    AST2 --> CMP
    CMP -->|verified| OUT
    SAFE -->|disabled| OUT

    class API,SEL,B1,B2 service
    class D1,D2 infra
    class SAFE,AST1,AST2,CMP flow
    class OUT ui
```

### Formatting Pipeline

```mermaid
sequenceDiagram
    participant User as User Code
    participant API as @birdcc/formatter
    participant Engine as Format Engine
    participant Parser as @birdcc/parser
    participant Safe as Safe Mode

    User->>API: formatBirdConfig(source, options)
    API->>API: resolveOptions(options)

    alt dprint Engine
        API->>Engine: formatWithEmbeddedDprint(source)
        Engine->>Engine: dprint context format
    else builtin Engine
        API->>Engine: formatWithBuiltin(source)
        Engine->>Parser: parseBirdConfig(source)
        Parser-->>Engine: ParsedBirdDocument
        Engine->>Engine: normalizeTextWithBuiltin(...)
    end

    Engine-->>API: formatted text

    opt safeMode enabled (both engines)
        API->>Safe: assertSafeModeSemanticEquivalence(source, formatted)
        Safe->>Parser: parseBirdConfig(source)
        Parser-->>Safe: fingerprint 1
        Safe->>Parser: parseBirdConfig(formattedText)
        Parser-->>Safe: fingerprint 2
        Safe->>Safe: compare fingerprints
        Safe-->>API: verified
    end

    API-->>User: BirdFormatResult
```

### Engine Selection & Fallback

```mermaid
flowchart TD
    classDef infra fill:#fce8e6,stroke:#c5221f,stroke-width:1.5px,color:#8f1d14
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef flow fill:#f8f9fa,stroke:#5f6368,stroke-width:1px,color:#3c4043

    START[formatBirdConfig] --> CONFIG{engine option?}

    CONFIG -->|dprint| TRY_DPRINT[formatWithEmbeddedDprint]
    CONFIG -->|builtin| USE_BUILTIN[formatWithBuiltin]
    CONFIG -->|auto| TRY_DPRINT_AUTO[Try dprint first]

    TRY_DPRINT --> DPRINT_OK{dprint OK?}
    TRY_DPRINT_AUTO --> DPRINT_OK_AUTO{dprint OK?}

    DPRINT_OK -->|yes| RETURN_DPRINT[Return result]
    DPRINT_OK -->|no| ERROR[Throw Error]

    DPRINT_OK_AUTO -->|yes| RETURN_DPRINT
    DPRINT_OK_AUTO -->|no| FALLBACK[Fallback to builtin]

    FALLBACK --> USE_BUILTIN
    USE_BUILTIN --> BUILTIN_OK{builtin OK?}
    BUILTIN_OK -->|yes| RETURN_BUILTIN[Return result]
    BUILTIN_OK -->|no| ERROR

    class START,CONFIG,ERROR flow
    class TRY_DPRINT,DPRINT_OK,DPRINT_OK_AUTO infra
    class USE_BUILTIN,BUILTIN_OK,FALLBACK,RETURN_BUILTIN service
```

### Safe Mode Verification

```mermaid
flowchart TD
    classDef service fill:#fef7e0,stroke:#ea8600,stroke-width:1.5px,color:#8a5a00
    classDef flow fill:#f8f9fa,stroke:#5f6368,stroke-width:1px,color:#3c4043
    classDef ui fill:#e8f0fe,stroke:#1967d2,stroke-width:1.5px,color:#0842a0

    RESULT[Formatted text] --> SAFE{safeMode?}

    SAFE -->|disabled| OUTPUT[Return result]
    SAFE -->|enabled| VERIFY[assertSafeModeSemanticEquivalence]
    VERIFY --> PARSE1[parseBirdConfig source]
    VERIFY --> PARSE2[parseBirdConfig formatted]
    PARSE1 --> CMP[compare fingerprints]
    PARSE2 --> CMP
    CMP -->|equivalent| OUTPUT
    CMP -->|diverged| ERROR[Throw Error]

    class RESULT service
    class SAFE,VERIFY,PARSE1,PARSE2,CMP,ERROR flow
    class OUTPUT ui
```

---

## Related Packages

| Package                                              | Description                     |
| ---------------------------------------------------- | ------------------------------- |
| [@birdcc/parser](../parser/)                         | Tree-sitter grammar and parser  |
| [@birdcc/core](../core/)                             | Semantic analysis engine        |
| [@birdcc/dprint-plugin-bird](../dprint-plugin-bird/) | dprint plugin (Rust/WASM)       |
| [@birdcc/linter](../linter/)                         | Lint rules and diagnostics      |
| [@birdcc/cli](../cli/)                               | CLI tool (`birdcc fmt` command) |
| [@birdcc/lsp](../lsp/)                               | LSP server implementation       |

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
- [dprint Documentation](https://dprint.dev/)
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
