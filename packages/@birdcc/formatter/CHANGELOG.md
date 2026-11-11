## @birdcc/formatter@1.1.0

### Document current package behavior

Describe each package from its current sources: CLI commands, options, exit codes, and JSON output; the lint rule catalog with default severities; formatter engines and options; language server capabilities and settings; and the VS Code extension's settings, commands, and snippets.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/250

## @birdcc/formatter@1.0.0

### Preserve syntax while formatting

Use Tree-sitter syntax boundaries for indentation in both formatters and verify syntax and token contents when `safeMode` is enabled in the direct WASM plugin.

PR: [#228](https://github.com/bird-chinese-community/BIRD-LSP/pull/228).
Issues: [#190](https://github.com/bird-chinese-community/BIRD-LSP/issues/190), [#191](https://github.com/bird-chinese-community/BIRD-LSP/issues/191).

### Support tab indentation in both formatter engines

Support tab indentation through the formatter's useTabs option in both engines.
The CLI reads `formatter.useTabs` from `bird.config.json`.

Keep the complete configuration corpus test responsive by moving formatter work to its worker and validating protocol responses.

PR: [#239](https://github.com/bird-chinese-community/BIRD-LSP/pull/239).
Issues: [#231](https://github.com/bird-chinese-community/BIRD-LSP/issues/231), [#238](https://github.com/bird-chinese-community/BIRD-LSP/issues/238).

### Refresh public configuration examples

Refresh the public reference configuration corpus and its pinned CI input metadata used by parser, formatter, lint, and analysis checks.

Commit: [618394f4](https://github.com/bird-chinese-community/BIRD-LSP/commit/618394f4a79082dd374eb82d26acb9e38abdebf3).

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

# @birdcc/formatter

## 0.1.2

### Patch Changes

- Updated dependencies [[`d124c20`](https://github.com/bird-chinese-community/BIRD-LSP/commit/d124c20028a9adb6a1d6b0bcb8c341b73c8266e2)]:
  - @birdcc/parser@0.1.2
  - @birdcc/dprint-plugin-bird@0.1.2

## 0.1.1

### Patch Changes

- Show each package's new BIRDCC brand icon at the top of its README.

- Updated dependencies []:
  - @birdcc/parser@0.1.1
  - @birdcc/dprint-plugin-bird@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [[`c2b5061`](https://github.com/bird-chinese-community/BIRD-LSP/commit/c2b506177125deffba32db8e2add1ce6deca87f8)]:
  - @birdcc/parser@0.1.0
  - @birdcc/dprint-plugin-bird@0.1.0
