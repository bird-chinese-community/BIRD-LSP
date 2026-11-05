---
packages:
  "@birdcc/lsp": patch
  "@birdcc/vscode": patch
---

## Coordinate extension dependency builds and stdio regressions

Build the extension's dependency closure before workspace tests and avoid rebuilding shared outputs while other test processes use them. Give the complete multi-stage real-stdio ownership regression a bounded execution budget while retaining each state assertion and cleanup step.

PR: [#245](https://github.com/bird-chinese-community/BIRD-LSP/pull/245).
Related issue: [#240](https://github.com/bird-chinese-community/BIRD-LSP/issues/240).
