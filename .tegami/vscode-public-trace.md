---
packages:
  "@birdcc/vscode": patch
---

## Honor the public protocol trace setting

Read language-client protocol tracing from the public bird2-lsp configuration namespace during startup and configuration changes.

Use `bird2-lsp.trace.server` to select `off`, `messages`, or `verbose`.

PR: [#237](https://github.com/bird-chinese-community/BIRD-LSP/pull/237).
Issue: [#246](https://github.com/bird-chinese-community/BIRD-LSP/issues/246).
