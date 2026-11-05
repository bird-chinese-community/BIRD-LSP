# @birdcc/lsp

## 0.1.3

### Patch Changes

- [#236](https://github.com/bird-chinese-community/BIRD-LSP/pull/236) [`1837133`](https://github.com/bird-chinese-community/BIRD-LSP/commit/183713315eb9521b3348d2f8d0577d73a38cc92e) Thanks [@Alice39s](https://github.com/Alice39s)! - Validate decoded ASN database columns and expose structured load failures with the package version and database content digest.

- [#233](https://github.com/bird-chinese-community/BIRD-LSP/pull/233) [`824f2e7`](https://github.com/bird-chinese-community/BIRD-LSP/commit/824f2e750ba963bbfae4394365aec3d9192dee85) Thanks [@Alice39s](https://github.com/Alice39s)! - Share project configuration validation, apply editor lint and format settings, report invalid configuration, and honor reference declaration requests.

- [#234](https://github.com/bird-chinese-community/BIRD-LSP/pull/234) [`3f79d9d`](https://github.com/bird-chinese-community/BIRD-LSP/commit/3f79d9d9e68b3fd91f50a4dcd395a506084901cf) Thanks [@Alice39s](https://github.com/Alice39s)! - Resolve internal runtime dependencies from the current workspace when packaging the extension.

- [#224](https://github.com/bird-chinese-community/BIRD-LSP/pull/224) [`250ea18`](https://github.com/bird-chinese-community/BIRD-LSP/commit/250ea187046daba6b8c921838e15f1517c092113) Thanks [@Alice39s](https://github.com/Alice39s)! - Resolve user symbols with case-sensitive names across declarations, inheritance, diagnostics, and navigation. Infer function return hints from parsed return statements, including nested control flow.

- [#235](https://github.com/bird-chinese-community/BIRD-LSP/pull/235) [`1239191`](https://github.com/bird-chinese-community/BIRD-LSP/commit/1239191d4f1aea01a8d53a3aca0770b55c470715) Thanks [@Alice39s](https://github.com/Alice39s)! - Bound analysis inputs and discovery, expose project and editor byte budgets, verify include targets, reuse parsed documents in cross-file lint, and validate performance fixture coverage.

- [#230](https://github.com/bird-chinese-community/BIRD-LSP/pull/230) [`e68aa8b`](https://github.com/bird-chinese-community/BIRD-LSP/commit/e68aa8bcd9f7aeea033a0b0db2b3d95f69a77ffd) Thanks [@Alice39s](https://github.com/Alice39s)! - Keep analysis tied to captured document versions and refresh include graphs after disk changes.

- [#223](https://github.com/bird-chinese-community/BIRD-LSP/pull/223) [`1f9c187`](https://github.com/bird-chinese-community/BIRD-LSP/commit/1f9c1879efa4307701d5dd977ee7db14c556d6f1) Thanks [@Alice39s](https://github.com/Alice39s)! - Update Zod and YAML to patched release lines and refresh the LSP text document implementation.

- [#247](https://github.com/bird-chinese-community/BIRD-LSP/pull/247) [`0248b6d`](https://github.com/bird-chinese-community/BIRD-LSP/commit/0248b6de001f743ec530b7b8bbf0977b5c139dca) Thanks [@Alice39s](https://github.com/Alice39s)! - Watch rootless project configuration and include directories before diagnostics, share native watches across open entries, and release unused directory handles. Report native watch failures with context while monitoring available directories.

- Updated dependencies [[`3b1f107`](https://github.com/bird-chinese-community/BIRD-LSP/commit/3b1f10722f1c267e9903e886ef7a0cedcc1561bd), [`1837133`](https://github.com/bird-chinese-community/BIRD-LSP/commit/183713315eb9521b3348d2f8d0577d73a38cc92e), [`824f2e7`](https://github.com/bird-chinese-community/BIRD-LSP/commit/824f2e750ba963bbfae4394365aec3d9192dee85), [`21a423f`](https://github.com/bird-chinese-community/BIRD-LSP/commit/21a423fdb0bb838fe54625eb7a37feed9191cb37), [`250ea18`](https://github.com/bird-chinese-community/BIRD-LSP/commit/250ea187046daba6b8c921838e15f1517c092113), [`1239191`](https://github.com/bird-chinese-community/BIRD-LSP/commit/1239191d4f1aea01a8d53a3aca0770b55c470715)]:
  - @birdcc/parser@0.1.3
  - @birdcc/formatter@0.1.3
  - @birdcc/intel@0.0.1
  - @birdcc/core@0.1.3
  - @birdcc/linter@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`d124c20`](https://github.com/bird-chinese-community/BIRD-LSP/commit/d124c20028a9adb6a1d6b0bcb8c341b73c8266e2)]:
  - @birdcc/parser@0.1.2
  - @birdcc/core@0.1.2
  - @birdcc/formatter@0.1.2
  - @birdcc/linter@0.1.2

## 0.1.1

### Patch Changes

- Show each package's new BIRDCC brand icon at the top of its README.

- Updated dependencies []:
  - @birdcc/parser@0.1.1
  - @birdcc/core@0.1.1
  - @birdcc/linter@0.1.1
  - @birdcc/formatter@0.1.1

## 0.1.0

### Patch Changes

- [#147](https://github.com/bird-chinese-community/BIRD-LSP/pull/147) [`e9ddd80`](https://github.com/bird-chinese-community/BIRD-LSP/commit/e9ddd80ab5e5adf4a54a959ff3c7708324c3dd21) Thanks [@Alice39s](https://github.com/Alice39s)! - Harden automatic BIRD project entry detection with parsed language evidence,
  resolved include topology, safe auto-selection, and foreign `.conf` guards.
- Updated dependencies [[`c2b5061`](https://github.com/bird-chinese-community/BIRD-LSP/commit/c2b506177125deffba32db8e2add1ce6deca87f8), [`e9ddd80`](https://github.com/bird-chinese-community/BIRD-LSP/commit/e9ddd80ab5e5adf4a54a959ff3c7708324c3dd21)]:
  - @birdcc/parser@0.1.0
  - @birdcc/linter@0.1.0
  - @birdcc/core@0.1.0
  - @birdcc/formatter@0.1.0
