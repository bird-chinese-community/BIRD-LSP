---
packages:
  "@birdcc/parser": patch
  "@birdcc/core": patch
  "@birdcc/linter": patch
  "@birdcc/lsp": patch
---

## Preserve symbol identity and infer parsed returns

Resolve user symbols with case-sensitive names across declarations, inheritance, diagnostics, and navigation. Infer function return hints from parsed return statements, including nested control flow.

PR: [#224](https://github.com/bird-chinese-community/BIRD-LSP/pull/224).
Issues: [#192](https://github.com/bird-chinese-community/BIRD-LSP/issues/192), [#193](https://github.com/bird-chinese-community/BIRD-LSP/issues/193).
