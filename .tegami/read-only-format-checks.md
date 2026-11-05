---
packages:
  "@birdcc/parser": patch
  "@birdcc/core": patch
  "@birdcc/linter": patch
  "@birdcc/lsp": patch
  "@birdcc/formatter": patch
  "@birdcc/cli": patch
  "@birdcc/dprint-plugin-bird": patch
  "@birdcc/intel": patch
  "@birdcc/vscode": patch
  bird2-extension-pack: patch
---

## Check formatting in CI without changing workspace files

Run package formatting tasks with `--check` in CI. Keep generated README sections owned by their synchronization workflow.

PR: [#226](https://github.com/bird-chinese-community/BIRD-LSP/pull/226).
Issue: [#203](https://github.com/bird-chinese-community/BIRD-LSP/issues/203).
