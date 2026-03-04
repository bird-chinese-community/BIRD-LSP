# Changelog 🕊️

All notable changes to `@birdcc/vscode` will be documented in this file.

## [0.3.1] - 2026-03-04

### 🐛 Fixed

- 📦 **OpenVSX Packaging Fix** — Fixed VSIX repackaging issue where the `zip` command added Unix-specific extra fields (UID/GID, permissions) that caused OpenVSX moderation to reject version 0.3.0. Added `-X` flag to exclude extra fields during packaging.

### 🔧 Improved

- 🔄 **OpenVSX Verification** — Added post-publish verification step in CI to poll OpenVSX API and confirm extension availability, detecting async moderation failures early.

## [0.3.0] - 2026-03-04

### ✨ Added

- 📦 **Extension Pack** — Introduced `@birdcc/vscode-pack` extension bundle with a dedicated icon and CI build/publish workflows, allowing users to install all BIRD2 tooling in one click.

- 🧠 **Context-Aware Hover System** — Completely rebuilt hover resolution with a context-aware pipeline that resolves usage snippets based on cursor position (e.g., protocol level vs. area level vs. interface level). The same resolver is now shared between the LSP server and the VS Code extension.

- 📚 **Comprehensive BGP Hover Docs** — Added 30+ hover-doc entries covering session, policy, timer, authentication, confederation, route reflector, and channel options; usage examples now show full hierarchical context (`protocol bgp <name> { ... }` and nested `ipv4 { ... }`).

- 📚 **Comprehensive OSPF Hover Docs** — Added 28 new hover-doc entries for protocol/area/interface levels, covering RFC 1583 compat, stub/NSSA areas, virtual links, and timers; usage examples expanded from 9 to 40+ with 3-level nesting.

- 📚 **BFD / Babel / RIP Hover Docs** — Added per-option documentation for BFD intervals, Babel rxcost and hello/update intervals, and RIP timers, split horizon, and version settings.

- 📚 **Kernel / Static / Device / Direct / Pipe Hover Docs** — Added coverage for scan time, check link, kernel table, merge paths, and peer table options.

- 📚 **RAdv / RPKI / Extended Protocol Hover Docs** — Added documentation for Aggregator, BMP, L3VPN, MRT, Perf, RAdv (prefix, RDNSS, DNSSL, RA intervals), and RPKI (TCP/SSH transport, refresh/retry/expire timers).

- 🔗 **Usage Entries for All Protocol Sub-Options** — Added ~80 inline usage snippets for sub-options across every major protocol, filling the last gaps for in-editor guidance.

- 🌐 **Global & Filter Keyword Coverage** — Completed hover-doc and usage coverage for all global and filter-language keywords.

### 🐛 Fixed

- 🖱️ **Duplicate Hover Suppression** — The VS Code extension now returns `null` from its hover provider when the LSP server is active, preventing duplicate hover popups from appearing simultaneously.

- 🔒 **`documentSymbol` Crash Guard** — Added a falsy check on `metadata.symbolName` before creating a `DocumentSymbol`, fixing a `vscode-languageclient` crash caused by empty symbol names.

- 🎨 **Hover Markdown Layout** — Hover cards now render with a structured heading + blockquote description + metadata section; parameters are displayed as a markdown table and reference links distinguish BIRD v2 vs v3.

- 📋 **FAQ Guidance for Command Failures** — Added in-extension status bar and output channel hints directing users to the FAQ when `bird -p` validation or extension commands fail to activate.

- 🔧 **Type Hints & Large-File Guidance** — Stabilized hover type-hint display and improved large-file guard messaging for a less confusing experience.

### ⚡ Performance

- 🚀 **Parallel Cross-File Lint** — `lintResolvedCrossFileGraph` now runs all per-file lint tasks concurrently with `Promise.all`, eliminating sequential await bottlenecks for workspaces with many `include` directives.

- 🧩 **LSP Request Deduplication** — `getGraphForDocument` now deduplicates in-flight cross-file analysis promises, preventing redundant graph rebuilds when multiple LSP requests (hover, completion, diagnostics) arrive simultaneously.

- ⌨️ **Smart Line-Scoped Keyword Matching** — Hover keyword extraction uses `getLineText()` instead of full-document `split()`, reducing per-keypress allocation from O(n) to O(1).

- ⏱️ **Fallback Validator Debounce** — Raised `VALIDATION_DEBOUNCE_MS` from 300 ms to 800 ms to cut down on unnecessary `bird -p` subprocess spawns during fast typing.

### 🔧 Improved

- 🛡️ **Beta Rule Severity Downgrade** — All linter rule severities have been reduced by one level for the beta period (`sym/cfg/net/type`: error → warning; `bgp/ospf`: warning → info) to lower noise while the rule set stabilizes.

- 🧹 **Shared LSP Utilities** — Extracted `utils.ts` with canonical key helpers, range conversion, and line-text accessors; eliminated duplicate implementations scattered across `shared.ts`, `diagnostic.ts`, and `symbol-utils.ts`.

- 📁 **Hover Docs Source-of-Truth Refactor** — Split hover documentation into per-protocol data directories, making it straightforward to add or update entries without touching unrelated files.

---

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

[0.3.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.2.0...vscode-v0.3.0
[0.2.0]: https://github.com/bird-chinese-community/BIRD-LSP/compare/vscode-v0.1.6...vscode-v0.2.0
[0.0.1-alpha.0]: https://github.com/bird-chinese-community/BIRD-LSP/releases/tag/vscode-v0.0.1-alpha.0
