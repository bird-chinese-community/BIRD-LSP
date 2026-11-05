---
packages:
  "@birdcc/formatter": patch
  "@birdcc/dprint-plugin-bird": patch
  "@birdcc/cli": patch
  dprint-plugin-bird: patch
---

## Support tab indentation in both formatter engines

Support tab indentation through the formatter's useTabs option in both engines.
The CLI reads `formatter.useTabs` from `bird.config.json`.

Keep the complete configuration corpus test responsive by moving formatter work to its worker and validating protocol responses.

PR: [#239](https://github.com/bird-chinese-community/BIRD-LSP/pull/239).
Issues: [#231](https://github.com/bird-chinese-community/BIRD-LSP/issues/231), [#238](https://github.com/bird-chinese-community/BIRD-LSP/issues/238).
