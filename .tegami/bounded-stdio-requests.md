---
packages:
  "@birdcc/lsp": patch
  "@birdcc/vscode": patch
---

## Honor the workspace build graph and observe stdio shutdown

Complete shared dependency builds before running workspace test tasks. Bound stdio test requests, report server failures, observe shutdown responses, and dispose spawned servers in compatibility CI.

PR: [#241](https://github.com/bird-chinese-community/BIRD-LSP/pull/241).
Issue: [#240](https://github.com/bird-chinese-community/BIRD-LSP/issues/240).
