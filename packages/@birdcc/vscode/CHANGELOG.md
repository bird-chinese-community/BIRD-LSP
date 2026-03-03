# Changelog 🕊️

All notable changes to `@birdcc/vscode` will be documented in this file.

## [0.1.3] - 2026-03-03

### 🐛 Fixed

- 📦 **Runtime Dependencies in VSIX** — Fix extension activation failure (`ERR_MODULE_NOT_FOUND`, e.g. `zod`) by packaging runtime dependencies into the VSIX artifact.
- 🧭 **Release Artifact Location** — Move packaged VSIX output from `dist/` to `release/` to avoid mixing distribution files with TypeScript build output.
- 🗂️ **Packaging Completeness** — Ensure runtime data files and dependency tree are included for offline VSIX installs.

---

## [0.1.2] - 2025-03-03

### ✨ Added

- 🎯 **Format Selection** — Register `DocumentRangeFormattingEditProvider` so you can now format selected code blocks, not just the entire document.
- 🖱️ **Editor Context Menu** — Right-click in the editor to access `BIRD2: Validate Active Document` and `BIRD2: Format Active Document` instantly.
- 📖 **Hover Documentation** — Keyword hover provider is here! Hover over BIRD2 keywords to see helpful documentation powered by YAML data.
- ⚡ **Real-time Fallback Validation** — Added `onDidChangeTextDocument` trigger for real-time diagnostics when running in fallback mode (no LSP server needed).

### 🔧 Improved

- 🛡️ **Status Bar Stability** — Hardened status-bar lifecycle initialization to eliminate unsafe early access patterns.
- 🔄 **Docs Sync Workflow** — Hover docs now use a shared YAML synchronization workflow via `sync:hover-docs` for easier maintenance.

---

## [0.1.1] - 2025-03-02

### 🔧 Improved

- 🎨 **Marketplace Icon** — Added `icon` metadata so the extension icon now displays beautifully in VS Code Marketplace and Open VSX.
- 🧹 **Cleaner Packaging** — Prevent nested VSIX artifacts by cleaning stale `dist/bird2-lsp.vsix` before packaging.

---

## [0.1.0] - 2025-03-01

### 🚀 Release

- 🏪 **First Marketplace Release** — Initial marketplace track release from the monorepo package.
- 🏷️ **Version Alignment** — Aligned versioning with VS Code Marketplace requirements for pre-release publishing.
- 🌐 **Dual Publishing** — Published to both Open VSX and VS Code Marketplace with pre-release channel enabled.

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

[0.1.2]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.1...vscode-v0.1.2
[0.1.3]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.2...vscode-v0.1.3
[0.1.1]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.0...vscode-v0.1.1
[0.1.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.0.1-alpha.0...vscode-v0.1.0
[0.0.1-alpha.0]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/vscode-v0.0.1-alpha.0
