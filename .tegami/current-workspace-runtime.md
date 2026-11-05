---
packages:
  "@birdcc/lsp": patch
  "@birdcc/vscode": patch
---

## Package current workspace runtime dependencies

Resolve internal runtime dependencies from the current workspace when packaging the extension. Pin VSCE and Open VSX tooling, verify internal package contents in the VSIX, and exercise the installed bundled server on the minimum supported and stable VS Code hosts.

PR: [#234](https://github.com/bird-chinese-community/BIRD-LSP/pull/234).
Issues: [#202](https://github.com/bird-chinese-community/BIRD-LSP/issues/202), [#242](https://github.com/bird-chinese-community/BIRD-LSP/issues/242).
