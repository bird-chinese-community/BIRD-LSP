---
packages:
  "@birdcc/parser": patch
  "@birdcc/lsp": patch
  "@birdcc/vscode": patch
---

## Coordinate parser and language-client dependency updates

Group the Tree-sitter CLI and runtime updates so grammar generation and the shipped WASM runtime can be verified together. Group the language client and server SDK updates for coordinated protocol and editor-host validation.

PR: [#227](https://github.com/bird-chinese-community/BIRD-LSP/pull/227).
Issues: [#204](https://github.com/bird-chinese-community/BIRD-LSP/issues/204), [#205](https://github.com/bird-chinese-community/BIRD-LSP/issues/205).
