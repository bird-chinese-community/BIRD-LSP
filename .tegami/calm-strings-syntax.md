---
packages:
  "@birdcc/parser": patch
  "@birdcc/formatter": patch
  "@birdcc/dprint-plugin-bird": patch
  dprint-plugin-bird: patch
---

## Preserve syntax while formatting

Use Tree-sitter syntax boundaries for indentation in both formatters and verify syntax and token contents when `safeMode` is enabled in the direct WASM plugin.

PR: [#228](https://github.com/bird-chinese-community/BIRD-LSP/pull/228).
Issues: [#190](https://github.com/bird-chinese-community/BIRD-LSP/issues/190), [#191](https://github.com/bird-chinese-community/BIRD-LSP/issues/191).
