---
packages:
  "@birdcc/vscode": patch
---

## Apply resource settings and editor formatting options

Apply resource settings to local providers, preserve valid configuration fields, forward ASN preferences, respect editor formatting options, and return small edits with cancellation checks.

Use current document content for large-file decisions and retain configured diagnostic visibility. Verify the installed VSIX starts its bundled server on the minimum supported and stable extension hosts.

PR: [#237](https://github.com/bird-chinese-community/BIRD-LSP/pull/237).
Issues: [#167](https://github.com/bird-chinese-community/BIRD-LSP/issues/167), [#168](https://github.com/bird-chinese-community/BIRD-LSP/issues/168), [#169](https://github.com/bird-chinese-community/BIRD-LSP/issues/169), [#172](https://github.com/bird-chinese-community/BIRD-LSP/issues/172), [#173](https://github.com/bird-chinese-community/BIRD-LSP/issues/173), [#174](https://github.com/bird-chinese-community/BIRD-LSP/issues/174), [#209](https://github.com/bird-chinese-community/BIRD-LSP/issues/209).
