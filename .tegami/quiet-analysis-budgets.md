---
packages:
  "@birdcc/core": patch
  "@birdcc/linter": patch
  "@birdcc/lsp": patch
  "@birdcc/cli": patch
---

## Bound include analysis and reuse parsed documents

Bound analysis inputs and discovery, expose project and editor byte budgets, verify include targets, reuse parsed documents in cross-file lint, and validate performance fixture coverage.

Report asynchronous directory read and close failures with context while retaining partial discovery results. Evict failed discovery promises by identity so later requests can retry without deleting newer cached work.

PR: [#235](https://github.com/bird-chinese-community/BIRD-LSP/pull/235).
Issues: [#181](https://github.com/bird-chinese-community/BIRD-LSP/issues/181), [#182](https://github.com/bird-chinese-community/BIRD-LSP/issues/182), [#183](https://github.com/bird-chinese-community/BIRD-LSP/issues/183), [#184](https://github.com/bird-chinese-community/BIRD-LSP/issues/184), [#185](https://github.com/bird-chinese-community/BIRD-LSP/issues/185).
