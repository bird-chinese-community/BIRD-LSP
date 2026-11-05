## @birdcc/core@1.0.0

### Apply shared project configuration and LSP request options

Share project configuration validation, apply editor lint and format settings, report invalid configuration, and honor reference declaration requests.

Keep non-empty `linter.extends` string arrays valid as a reserved configuration field; preset inheritance remains a separate capability. Apply explicit `linter.rules` settings to diagnostics and reject invalid field types.

PR: [#233](https://github.com/bird-chinese-community/BIRD-LSP/pull/233).
Issues: [#177](https://github.com/bird-chinese-community/BIRD-LSP/issues/177), [#178](https://github.com/bird-chinese-community/BIRD-LSP/issues/178), [#179](https://github.com/bird-chinese-community/BIRD-LSP/issues/179), [#180](https://github.com/bird-chinese-community/BIRD-LSP/issues/180).

### Preserve symbol identity and infer parsed returns

Resolve user symbols with case-sensitive names across declarations, inheritance, diagnostics, and navigation. Infer function return hints from parsed return statements, including nested control flow.

PR: [#224](https://github.com/bird-chinese-community/BIRD-LSP/pull/224).
Issues: [#192](https://github.com/bird-chinese-community/BIRD-LSP/issues/192), [#193](https://github.com/bird-chinese-community/BIRD-LSP/issues/193).

### Refresh public configuration examples

Refresh the public reference configuration corpus and its pinned CI input metadata used by parser, formatter, lint, and analysis checks.

Commit: [618394f4](https://github.com/bird-chinese-community/BIRD-LSP/commit/618394f4a79082dd374eb82d26acb9e38abdebf3).

### Bound include analysis and reuse parsed documents

Bound analysis inputs and discovery, expose project and editor byte budgets, verify include targets, reuse parsed documents in cross-file lint, and validate performance fixture coverage.

Report asynchronous directory read and close failures with context while retaining partial discovery results. Evict failed discovery promises by identity so later requests can retry without deleting newer cached work.

PR: [#235](https://github.com/bird-chinese-community/BIRD-LSP/pull/235).
Issues: [#181](https://github.com/bird-chinese-community/BIRD-LSP/issues/181), [#182](https://github.com/bird-chinese-community/BIRD-LSP/issues/182), [#183](https://github.com/bird-chinese-community/BIRD-LSP/issues/183), [#184](https://github.com/bird-chinese-community/BIRD-LSP/issues/184), [#185](https://github.com/bird-chinese-community/BIRD-LSP/issues/185).

### Check formatting in CI without changing workspace files

Run package formatting tasks with `--check` in CI. Keep generated README sections owned by their synchronization workflow.

PR: [#226](https://github.com/bird-chinese-community/BIRD-LSP/pull/226).
Issue: [#203](https://github.com/bird-chinese-community/BIRD-LSP/issues/203).

### Release the BIRDCC toolchain as 1.0.0

Coordinate the parser, semantic analysis, linter, formatter, language server, CLI, ASN data package, VS Code extension, extension pack, and Rust formatter metadata at version 1.0.0.

Use Tegami changesets for package changelogs, version plans, and resumable npm releases. Keep original Issue and PR links in each change entry. Version the private editor packages for their VSIX releases and the Rust crate for its bundled WASM artifact.

Include root Cargo workspace manifests and lockfiles in build cache inputs so Rust dependency and profile changes rebuild the shipped formatter.

The VS Code extension requires VS Code 1.100 or newer. Release tooling requires Node.js 24 or newer.

Related audit: [#162](https://github.com/bird-chinese-community/BIRD-LSP/issues/162).

# @birdcc/core

## 0.1.2

### Patch Changes

- Updated dependencies [[`d124c20`](https://github.com/bird-chinese-community/BIRD-LSP/commit/d124c20028a9adb6a1d6b0bcb8c341b73c8266e2)]:
  - @birdcc/parser@0.1.2

## 0.1.1

### Patch Changes

- Show each package's new BIRDCC brand icon at the top of its README.

- Updated dependencies []:
  - @birdcc/parser@0.1.1

## 0.1.0

### Patch Changes

- [#147](https://github.com/bird-chinese-community/BIRD-LSP/pull/147) [`e9ddd80`](https://github.com/bird-chinese-community/BIRD-LSP/commit/e9ddd80ab5e5adf4a54a959ff3c7708324c3dd21) Thanks [@Alice39s](https://github.com/Alice39s)! - Harden automatic BIRD project entry detection with parsed language evidence,
  resolved include topology, safe auto-selection, and foreign `.conf` guards.
- Updated dependencies [[`c2b5061`](https://github.com/bird-chinese-community/BIRD-LSP/commit/c2b506177125deffba32db8e2add1ce6deca87f8)]:
  - @birdcc/parser@0.1.0
