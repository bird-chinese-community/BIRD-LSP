---
packages:
  "@birdcc/lsp": patch
---

## Watch single-file projects before publishing diagnostics

Watch rootless project configuration and include directories before diagnostics, share native watches across open entries, and release unused directory handles. Report native watch failures with context while monitoring available directories.

Apply configuration creation, disabling, and re-enabling to entry and closed-include diagnostics. Keep readable files analyzable when an ancestor directory cannot be watched, and retain watches and diagnostics owned by other open entries.

PR: [#247](https://github.com/bird-chinese-community/BIRD-LSP/pull/247).
Issues: [#176](https://github.com/bird-chinese-community/BIRD-LSP/issues/176), [#244](https://github.com/bird-chinese-community/BIRD-LSP/issues/244).
