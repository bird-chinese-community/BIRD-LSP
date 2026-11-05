## bird2-extension-pack@1.0.0

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

### Require VS Code 1.100 or newer

Require VS Code 1.100 or newer for the ESM extension entry point and test the minimum supported host alongside stable.

Update VS Code before installing this release when using an older host.

PR: [#225](https://github.com/bird-chinese-community/BIRD-LSP/pull/225).
Issue: [#163](https://github.com/bird-chinese-community/BIRD-LSP/issues/163).

# Changelog

All notable changes to `bird2-extension-pack` will be documented in this file.

## [0.1.3] - 2026-10-03

- 换用 BIRDCC 新的品牌图标，商店横幅颜色改为与图标一致；`@birdcc/vscode` 扩展升级至 `0.5.3`。 / Switch to the new BIRDCC brand icon with a matching gallery banner color, and bump the `@birdcc/vscode` extension to `0.5.3`.

## [0.1.2] - 2026-07-19

- 升级 `@birdcc/vscode` 扩展至 `0.5.2`，并接入自动化双商店发布与版本验证。 / Bump the `@birdcc/vscode` extension to `0.5.2` and enable automated dual-registry publishing with version verification.

## [0.1.1] - 2026-05-02

- 升级 `@birdcc/vscode` 依赖至 `0.5.1`。 / Bump `@birdcc/vscode` dependency to `0.5.1`.

## [0.1.0] - 2026-03-03

### Added / 新增

- 初始扩展包发布，包含 `birdcc.bird2-lsp` 和 `birdcc.vscode-bird2-conf`。 / Initial extension pack release, includes `birdcc.bird2-lsp` and `birdcc.vscode-bird2-conf`.
