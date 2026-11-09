---
packages:
  "@birdcc/parser": minor
  "@birdcc/core": patch
  "@birdcc/intel": minor
  "@birdcc/lsp": minor
  "@birdcc/vscode": minor
---

## Add optional DN42 IP intelligence

Add a user setting that enables DN42 IP address hover. Download and verify the City and ASN MMDB pair in the background, retain the cached pair on update failure, and check for database updates daily while enabled.
