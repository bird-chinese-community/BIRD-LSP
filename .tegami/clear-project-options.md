---
packages:
  "@birdcc/core": patch
  "@birdcc/cli": patch
  "@birdcc/lsp": patch
---

## Apply shared project configuration and LSP request options

Share project configuration validation, apply editor lint and format settings, report invalid configuration, and honor reference declaration requests.

Keep non-empty `linter.extends` string arrays valid as a reserved configuration field; preset inheritance remains a separate capability. Apply explicit `linter.rules` settings to diagnostics and reject invalid field types.

PR: [#233](https://github.com/bird-chinese-community/BIRD-LSP/pull/233).
Issues: [#177](https://github.com/bird-chinese-community/BIRD-LSP/issues/177), [#178](https://github.com/bird-chinese-community/BIRD-LSP/issues/178), [#179](https://github.com/bird-chinese-community/BIRD-LSP/issues/179), [#180](https://github.com/bird-chinese-community/BIRD-LSP/issues/180).
