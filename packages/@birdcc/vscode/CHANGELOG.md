# Changelog 🕊️

All notable changes to `@birdcc/vscode` will be documented in this file.

## [0.2.0] - 2026-03-03

### ✨ Added

- 🎯 **Format Selection** — Registered `DocumentRangeFormattingEditProvider` so selected blocks can be formatted directly.
- 🖱️ **Editor Context Menu Commands** — Added right-click actions for `BIRD2: Validate Active Document` and `BIRD2: Format Active Document`.
- 📖 **Keyword Hover Documentation** — Added YAML-driven hover docs for BIRD2 keywords.
- ⚡ **Real-time Fallback Validation** — Added `onDidChangeTextDocument` validation in fallback mode.

### 🐛 Fixed

- 📦 **VSIX Runtime Completeness** — Packaged runtime dependencies and required data assets to avoid activation/runtime missing module errors.
- 🚀 **Bundled LSP Startup** — Default startup now uses bundled `@birdcc/lsp`, removing hard dependency on globally installed `birdcc`.
- 🔌 **LSP stdio Transport** — Bundled server startup now passes `--stdio`, fixing connection stream initialization and crash loops.
- 🧩 **Activation Reliability** — Added explicit `onCommand:*` activation events to ensure command-triggered activation is reliable.
- 🖱️ **Context Menu Visibility** — Corrected `menus.when` expressions for `bird2` language context.
- 🌐 **Remote Workspace Support** — Relaxed provider registration selectors to work in non-`file` documents (remote workspaces).

### 🔧 Improved

- 🛡️ **Status Bar Stability** — Hardened status/lifecycle initialization and improved status display consistency.
- 📝 **Runtime Logging** — Improved output channel logging for startup mode and lifecycle diagnostics.
- 🚚 **Packaging Workflow** — Standardized VSIX artifact output to `release/bird2-lsp.vsix` and cleaned legacy output to avoid nested/stale artifacts.
- 🧭 **Docs Sync Workflow** — Standardized hover docs synchronization flow for maintainability.
- 🎨 **Marketplace Metadata** — Added extension icon and refined packaging metadata for cleaner marketplace display.

---

## [0.0.1-alpha.0] - 2025-02-28

### 🎉 Initial Release

- 🏗️ **Extension Scaffold** — Initial VS Code extension scaffold and activation lifecycle.
- 🔒 **Security First** — Fallback validation command hardening with workspace trust checks.
- 📁 **Large File Support** — Large-file guards for expensive extension-side features.
- 🧪 **Testing Foundation** — Real-world performance and smoke-test integration support.
- ✅ **Unit Tests** — Initial unit-testing foundation with Vitest (test script + config + security/config parser tests).
- 📚 **Documentation** — Package-level README and configuration guide.

---

[0.2.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.6...vscode-v0.2.0
[0.0.1-alpha.0]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/vscode-v0.0.1-alpha.0
