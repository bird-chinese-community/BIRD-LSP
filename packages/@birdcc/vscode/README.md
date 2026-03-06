<div align="center">

# 🕊 BIRD2 LSP for VSCode

</div>

<div align="center">

> 🧪 **Beta Stage**: This extension is in active development. While more stable than Alpha, some features may still change or have issues. Please evaluate carefully before deploying in production environments.

</div>

<p align="center">
  <strong>Full Language Server Protocol Support for BIRD2 Configurations</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">
    <img src="https://img.shields.io/visual-studio-marketplace/v/birdcc.bird2-lsp?style=flat-square&label=VS%20Marketplace&color=007ACC" alt="VS Marketplace Version" />
  </a>
  <a href="https://open-vsx.org/extension/birdcc/bird2-lsp">
    <img src="https://img.shields.io/open-vsx/v/birdcc/bird2-lsp?style=flat-square&label=Open%20VSX&color=C160EF" alt="Open VSX Version" />
  </a>
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-GPL%203.0-green.svg?style=flat-square" alt="License" />
  </a>
</p>

> [Overview](#overview) · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Configuration](#configuration) · [Commands](#commands) · [Snippets](#snippets)

---

## Overview

**BIRD2 LSP** is a VS Code extension designed for [BIRD2](https://bird.network.cz/) (BIRD Internet Routing Daemon) configuration files, delivering comprehensive Language Server Protocol support for a modern IDE experience.

> [!IMPORTANT]
> This extension also supports BIRD3 configuration files, accommodating various file naming conventions including `.conf`, `.bird`, `.bird2`, and `.bird3`.

---

## Features

| Feature                      | Description                              | Status |
| ---------------------------- | ---------------------------------------- | ------ |
| 🎨 **Syntax Highlighting**   | Tree-sitter based parsing for BIRD files | ✅     |
| 🔍 **Real-time Diagnostics** | 32+ lint rules + `bird -p` validation    | ✅     |
| 📝 **Code Formatting**       | Dual-engine with dprint and builtin      | ✅     |
| 💡 **IntelliSense**          | Auto-completion for keywords and symbols | ✅     |
| 🔎 **Hover Information**     | Type info and documentation on hover     | ✅     |
| 🏗️ **Symbol Navigation**     | Go to Definition and Find References     | ✅     |
| 📑 **Document Outline**      | Document Symbol structure browsing       | ✅     |
| ⌨️ **Code Snippets**         | 22 reusable code templates               | ✅     |

### Supported Language IDs

- `bird2` - BIRD2 configuration files
- File extensions: `.conf`, `.bird`, `.bird2`, `.bird3`, `.bird2.conf`, `.bird3.conf`
- Filenames: `bird.conf`, `bird2.conf`

---

## Installation

### From VS Code Marketplace (Recommended)

1. Open VS Code
2. Click the **Extensions** icon in the left activity bar (Ctrl+Shift+X)
3. Search for `BIRD2 LSP`
4. Click **Install**

Or visit the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp).

### From Open VSX Registry

For VSCodium and Eclipse Theia:

1. Open the Extensions panel
2. Search for `BIRD2 LSP`
3. Click **Install**

Or visit the [Open VSX page](https://open-vsx.org/extension/birdcc/bird2-lsp).

### From VSIX File

```bash
# Command line installation
code --install-extension bird2-lsp-0.1.0-alpha.vsix
```

### Requirements

- **VS Code**: ^1.80.0
- **birdcc CLI**: Recommended for full functionality
  ```bash
  npm install -g @birdcc/cli
  ```
- **BIRD2**: Optional, used for native `bird -p` validation

---

## Usage

### Quick Start

1. After installing the extension, open any `.conf` or `.bird` file
2. The extension will automatically recognize BIRD2 configuration files
3. Enjoy intelligent suggestions, real-time diagnostics, and code formatting

### Validate Configuration

Open the Command Palette (Ctrl+Shift+P) and type:

- `BIRD2: Validate Active Document` — Validate the current document
- `BIRD2: Format Active Document` — Format the current document

---

## Configuration

### settings.json

```json
{
  "bird2-lsp.enabled": true,
  "bird2-lsp.serverPath": ["birdcc", "lsp", "--stdio"],
  "bird2-lsp.formatter.engine": "dprint",
  "bird2-lsp.validation.command": "bird -p -c {file}"
}
```

### Core Configuration

| Configuration Key              | Type                      | Default                      | Description                 |
| ------------------------------ | ------------------------- | ---------------------------- | --------------------------- |
| `bird2-lsp.enabled`            | `boolean`                 | `true`                       | Enable Language Server      |
| `bird2-lsp.serverPath`         | `string[]`                | `["birdcc","lsp","--stdio"]` | LSP server launch command   |
| `bird2-lsp.formatter.engine`   | `"dprint"` \| `"builtin"` | `"dprint"`                   | Preferred formatting engine |
| `bird2-lsp.validation.command` | `string`                  | `"bird -p -c {file}"`        | BIRD validation command     |

### Full Configuration Reference

| Configuration Key                        | Type                                   | Default                      | Description                 |
| ---------------------------------------- | -------------------------------------- | ---------------------------- | --------------------------- |
| `bird2-lsp.enabled`                      | `boolean`                              | `true`                       | Enable Language Server      |
| `bird2-lsp.serverPath`                   | `string \| string[]`                   | `["birdcc","lsp","--stdio"]` | LSP server path             |
| `bird2-lsp.trace.server`                 | `"off"` \| `"messages"` \| `"verbose"` | `"off"`                      | Trace level                 |
| `bird2-lsp.validation.enabled`           | `boolean`                              | `true`                       | Enable `bird -p` validation |
| `bird2-lsp.validation.command`           | `string`                               | `"bird -p -c {file}"`        | Validation command          |
| `bird2-lsp.validation.onSave`            | `boolean`                              | `true`                       | Validate on save            |
| `bird2-lsp.validation.timeout`           | `number`                               | `30000`                      | Validation timeout (ms)     |
| `bird2-lsp.formatter.engine`             | `"dprint"` \| `"builtin"`              | `"dprint"`                   | Formatting engine           |
| `bird2-lsp.formatter.safeMode`           | `boolean`                              | `true`                       | Enable safe mode            |
| `bird2-lsp.typeHints.enabled`            | `boolean`                              | `true`                       | Enable type hints           |
| `bird2-lsp.performance.maxFileSizeBytes` | `number`                               | `2097152`                    | Large file threshold (2MB)  |

---

## Commands

Open the Command Palette (Ctrl+Shift+P) and search for `BIRD2`:

| Command                            | Title                               | Description               |
| ---------------------------------- | ----------------------------------- | ------------------------- |
| `bird2-lsp.restartLanguageServer`  | **BIRD2: Restart Language Server**  | Restart the LSP server    |
| `bird2-lsp.enableLanguageServer`   | **BIRD2: Enable Language Server**   | Enable the LSP server     |
| `bird2-lsp.disableLanguageServer`  | **BIRD2: Disable Language Server**  | Disable the LSP server    |
| `bird2-lsp.validateActiveDocument` | **BIRD2: Validate Active Document** | Validate current document |
| `bird2-lsp.formatActiveDocument`   | **BIRD2: Format Active Document**   | Format current document   |
| `bird2-lsp.openSettings`           | **BIRD2: Open Extension Settings**  | Open settings page        |
| `bird2-lsp.showOutputChannel`      | **BIRD2: Show Output Channel**      | Show output for debugging |
| `bird2-lsp.showDocumentation`      | **BIRD2: Open Documentation**       | Open documentation        |
| `bird2-lsp.reloadConfiguration`    | **BIRD2: Reload Configuration**     | Reload configuration      |

---

## Snippets

The extension includes 22 built-in code snippets:

### Directives

| Prefix                      | Description                |
| --------------------------- | -------------------------- |
| `bird-dir-router-id`        | Set Router ID              |
| `bird-dir-include`          | Include external file      |
| `bird-var-define`           | Define a constant          |
| `bird-dir-log`              | Configure log output       |
| `bird-dir-graceful-restart` | Configure graceful restart |

### Protocols

| Prefix                     | Description                  |
| -------------------------- | ---------------------------- |
| `bird-proto-tmpl`          | Protocol template definition |
| `bird-proto-bgp-basic`     | Basic BGP configuration      |
| `bird-proto-bgp-full`      | Full BGP configuration       |
| `bird-proto-bgp-rr-client` | BGP route reflector client   |
| `bird-proto-ospf`          | OSPF protocol configuration  |
| `bird-proto-static`        | Static route configuration   |
| `bird-proto-kernel`        | Kernel routing table sync    |

### Filters

| Prefix                  | Description            |
| ----------------------- | ---------------------- |
| `bird-filter-simple`    | Simple filter          |
| `bird-filter-prefix`    | Prefix list matching   |
| `bird-filter-community` | BGP Community matching |
| `bird-filter-as-path`   | AS Path matching       |
| `bird-filter-rpki`      | RPKI validation check  |

### Functions

| Prefix                | Description               |
| --------------------- | ------------------------- |
| `bird-func-basic`     | Basic function definition |
| `bird-func-prepend`   | AS Path Prepend           |
| `bird-func-net-match` | Network prefix matching   |

### Control Flow

| Prefix           | Description    |
| ---------------- | -------------- |
| `bird-flow-if`   | If statement   |
| `bird-flow-case` | Case statement |
| `bird-flow-for`  | For loop       |

---

## Related Packages

| Package             | Description                       | Link                                                   |
| ------------------- | --------------------------------- | ------------------------------------------------------ |
| `@birdcc/parser`    | Tree-sitter grammar parser        | [npm](https://www.npmjs.com/package/@birdcc/parser)    |
| `@birdcc/core`      | AST / Symbol Table / Type Checker | [npm](https://www.npmjs.com/package/@birdcc/core)      |
| `@birdcc/linter`    | 32+ lint rule engine              | [npm](https://www.npmjs.com/package/@birdcc/linter)    |
| `@birdcc/formatter` | Code formatting engine            | [npm](https://www.npmjs.com/package/@birdcc/formatter) |
| `@birdcc/cli`       | Command line tool                 | [npm](https://www.npmjs.com/package/@birdcc/cli)       |

---

## Feedback & Support

We welcome your feedback! Please use the appropriate template when reporting issues or requesting features:

| Type                   | Link                                                                                                          | Description                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 🐛 **Bug Report**      | [Create Bug Report](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml)    | Report unexpected behavior, crashes, or errors |
| ✨ **Feature Request** | [Request Feature](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=feature-request.yml) | Suggest new features or improvements           |
| 💬 **Discussions**     | [GitHub Discussions](https://github.com/bird-chinese-community/BIRD-LSP/discussions)                          | Ask questions, share ideas, or get help        |
| 📋 **Task Index**      | [View Task Index](https://github.com/bird-chinese-community/BIRD-LSP/issues/62)                               | Check current implementation progress          |

> [!TIP]
> Before creating a new issue, please search [existing issues](https://github.com/bird-chinese-community/BIRD-LSP/issues) to avoid duplicates.

---

### 📖 Documentation

- [BIRD Official Documentation](https://bird.network.cz/)
- [BIRD2 User Manual](https://bird.network.cz/doc/bird.html)
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
- [`186526/net186-config`](https://github.com/186526/net186-config)
- [`tianshome/bird-configs-output`](https://github.com/tianshome/bird-configs-output)
<!-- CI END -->

---

<p align="center">
  <sub>Built with ❤️ by the BIRD Chinese Community (BIRDCC)</sub>
</p>

<p align="center">
  <a href="https://github.com/bird-chinese-community/BIRD-LSP">🕊 GitHub</a> ·
  <a href="https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp">🛒 Marketplace</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml">🐛 Report Bug</a> ·
  <a href="https://github.com/bird-chinese-community/BIRD-LSP/discussions">💬 Discussions</a>
</p>
