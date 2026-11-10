---
packages:
  "@birdcc/parser": minor
  "@birdcc/core": patch
  "@birdcc/intel": minor
  "@birdcc/lsp": minor
  "@birdcc/vscode": minor
---

## Add optional DN42 IP and ASN intelligence

Add user-enabled DN42 IP and ASN hover with English location names, prefix-scoped service and DNS observations, and registry-derived origin policy. VS Code shows the hover as a property sheet with theme-colored result icons; other clients receive the same layout in Markdown. Use DN42-IPDB-SDK to download and verify the database bundle in the background through the proxy environment variables, retain loaded data on update failure, and check for updates daily while enabled.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/254
