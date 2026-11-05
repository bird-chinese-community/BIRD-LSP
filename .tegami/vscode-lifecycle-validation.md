---
packages:
  "@birdcc/vscode": patch
---

## Recover the language client and preserve validation diagnostics

Terminate timed-out server processes, follow client connection state, retain manual validation diagnostics, and validate saved content with fallback validation.

Stop persistent fallback validation after the language client recovers and keep the status bar aligned with the actual connection state.

PR: [#229](https://github.com/bird-chinese-community/BIRD-LSP/pull/229).
Issues: [#164](https://github.com/bird-chinese-community/BIRD-LSP/issues/164), [#165](https://github.com/bird-chinese-community/BIRD-LSP/issues/165), [#166](https://github.com/bird-chinese-community/BIRD-LSP/issues/166), [#170](https://github.com/bird-chinese-community/BIRD-LSP/issues/170), [#171](https://github.com/bird-chinese-community/BIRD-LSP/issues/171).
