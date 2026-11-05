---
packages:
  "@birdcc/parser": major
  "@birdcc/core": major
  "@birdcc/linter": major
  "@birdcc/lsp": major
  "@birdcc/formatter": major
  "@birdcc/cli": major
  "@birdcc/dprint-plugin-bird": major
  "@birdcc/intel": major
  "@birdcc/vscode": major
  bird2-extension-pack: major
  dprint-plugin-bird: major
---

# Release the BIRDCC toolchain as 1.0.0

Coordinate the parser, semantic analysis, linter, formatter, language server, CLI, ASN data package, VS Code extension, extension pack, and Rust formatter metadata at version 1.0.0.

Use Tegami changesets for package changelogs, version plans, and resumable npm releases. Keep original Issue and PR links in each change entry. Version the private editor packages for their VSIX releases and the Rust crate for its bundled WASM artifact.

Include root Cargo workspace manifests and lockfiles in build cache inputs so Rust dependency and profile changes rebuild the shipped formatter.

The VS Code extension requires VS Code 1.100 or newer. Release tooling requires Node.js 24 or newer.

Related audit: [#162](https://github.com/bird-chinese-community/BIRD-LSP/issues/162).
