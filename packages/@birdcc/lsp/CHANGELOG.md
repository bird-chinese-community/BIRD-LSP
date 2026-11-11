## @birdcc/lsp@1.1.0

### Add optional DN42 IP and ASN intelligence

Add user-enabled DN42 IP and ASN hover with English location names, prefix-scoped service and DNS observations, and registry-derived origin policy. VS Code shows the hover as a property sheet with theme-colored result icons; other clients receive the same layout in Markdown. Use DN42-IPDB-SDK to download and verify the database bundle in the background through the proxy environment variables, retain loaded data on update failure, and check for updates daily while enabled.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/254

### Document current package behavior

Describe each package from its current sources: CLI commands, options, exit codes, and JSON output; the lint rule catalog with default severities; formatter engines and options; language server capabilities and settings; and the VS Code extension's settings, commands, and snippets.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/250

## @birdcc/lsp@1.0.0

### Honor the workspace build graph and observe stdio shutdown

Complete shared dependency builds before running workspace test tasks. Bound stdio test requests, report server failures, observe shutdown responses, and dispose spawned servers in compatibility CI.

PR: [#241](https://github.com/bird-chinese-community/BIRD-LSP/pull/241).
Issue: [#240](https://github.com/bird-chinese-community/BIRD-LSP/issues/240).

### Validate ASN database content and report loading failures

Validate decoded ASN database columns and expose structured load failures with the package version and database content digest.

PR: [#236](https://github.com/bird-chinese-community/BIRD-LSP/pull/236).
Issues: [#206](https://github.com/bird-chinese-community/BIRD-LSP/issues/206), [#207](https://github.com/bird-chinese-community/BIRD-LSP/issues/207).

### Apply shared project configuration and LSP request options

Share project configuration validation, apply editor lint and format settings, report invalid configuration, and honor reference declaration requests.

Keep non-empty `linter.extends` string arrays valid as a reserved configuration field; preset inheritance remains a separate capability. Apply explicit `linter.rules` settings to diagnostics and reject invalid field types.

PR: [#233](https://github.com/bird-chinese-community/BIRD-LSP/pull/233).
Issues: [#177](https://github.com/bird-chinese-community/BIRD-LSP/issues/177), [#178](https://github.com/bird-chinese-community/BIRD-LSP/issues/178), [#179](https://github.com/bird-chinese-community/BIRD-LSP/issues/179), [#180](https://github.com/bird-chinese-community/BIRD-LSP/issues/180).

### Coordinate parser and language-client dependency updates

Group the Tree-sitter CLI and runtime updates so grammar generation and the shipped WASM runtime can be verified together. Group the language client and server SDK updates for coordinated protocol and editor-host validation.

PR: [#227](https://github.com/bird-chinese-community/BIRD-LSP/pull/227).
Issues: [#204](https://github.com/bird-chinese-community/BIRD-LSP/issues/204), [#205](https://github.com/bird-chinese-community/BIRD-LSP/issues/205).

### Package current workspace runtime dependencies

Resolve internal runtime dependencies from the current workspace when packaging the extension. Pin VSCE and Open VSX tooling, verify internal package contents in the VSIX, and exercise the installed bundled server on the minimum supported and stable VS Code hosts.

PR: [#234](https://github.com/bird-chinese-community/BIRD-LSP/pull/234).
Issues: [#202](https://github.com/bird-chinese-community/BIRD-LSP/issues/202), [#242](https://github.com/bird-chinese-community/BIRD-LSP/issues/242).

### Preserve symbol identity and infer parsed returns

Resolve user symbols with case-sensitive names across declarations, inheritance, diagnostics, and navigation. Infer function return hints from parsed return statements, including nested control flow.

PR: [#224](https://github.com/bird-chinese-community/BIRD-LSP/pull/224).
Issues: [#192](https://github.com/bird-chinese-community/BIRD-LSP/issues/192), [#193](https://github.com/bird-chinese-community/BIRD-LSP/issues/193).

### Bound include analysis and reuse parsed documents

Bound analysis inputs and discovery, expose project and editor byte budgets, verify include targets, reuse parsed documents in cross-file lint, and validate performance fixture coverage.

Report asynchronous directory read and close failures with context while retaining partial discovery results. Evict failed discovery promises by identity so later requests can retry without deleting newer cached work.

PR: [#235](https://github.com/bird-chinese-community/BIRD-LSP/pull/235).
Issues: [#181](https://github.com/bird-chinese-community/BIRD-LSP/issues/181), [#182](https://github.com/bird-chinese-community/BIRD-LSP/issues/182), [#183](https://github.com/bird-chinese-community/BIRD-LSP/issues/183), [#184](https://github.com/bird-chinese-community/BIRD-LSP/issues/184), [#185](https://github.com/bird-chinese-community/BIRD-LSP/issues/185).

### Bind analysis results to document versions and disk changes

Keep analysis tied to captured document versions and refresh include graphs after disk changes.

PR: [#230](https://github.com/bird-chinese-community/BIRD-LSP/pull/230).
Issues: [#175](https://github.com/bird-chinese-community/BIRD-LSP/issues/175), [#176](https://github.com/bird-chinese-community/BIRD-LSP/issues/176), [#244](https://github.com/bird-chinese-community/BIRD-LSP/issues/244).

### Check formatting in CI without changing workspace files

Run package formatting tasks with `--check` in CI. Keep generated README sections owned by their synchronization workflow.

PR: [#226](https://github.com/bird-chinese-community/BIRD-LSP/pull/226).
Issue: [#203](https://github.com/bird-chinese-community/BIRD-LSP/issues/203).

### Refresh runtime validation and release checks

Update Zod and YAML to patched release lines and refresh the LSP text document implementation.

Validate package release plans, production version commands, lockfile updates, and temporary version-worktree cleanup.

PR: [#223](https://github.com/bird-chinese-community/BIRD-LSP/pull/223).
Issues: [#194](https://github.com/bird-chinese-community/BIRD-LSP/issues/194), [#243](https://github.com/bird-chinese-community/BIRD-LSP/issues/243).

### Watch single-file projects before publishing diagnostics

Watch rootless project configuration and include directories before diagnostics, share native watches across open entries, and release unused directory handles. Report native watch failures with context while monitoring available directories.

Apply configuration creation, disabling, and re-enabling to entry and closed-include diagnostics. Keep readable files analyzable when an ancestor directory cannot be watched, and retain watches and diagnostics owned by other open entries.

PR: [#247](https://github.com/bird-chinese-community/BIRD-LSP/pull/247).
Issues: [#176](https://github.com/bird-chinese-community/BIRD-LSP/issues/176), [#244](https://github.com/bird-chinese-community/BIRD-LSP/issues/244).

### Release the BIRDCC toolchain as 1.0.0

Coordinate the parser, semantic analysis, linter, formatter, language server, CLI, ASN data package, VS Code extension, extension pack, and Rust formatter metadata at version 1.0.0.

Use Tegami changesets for package changelogs, version plans, and resumable npm releases. Keep original Issue and PR links in each change entry. Version the private editor packages for their VSIX releases and the Rust crate for its bundled WASM artifact.

Include root Cargo workspace manifests and lockfiles in build cache inputs so Rust dependency and profile changes rebuild the shipped formatter.

The VS Code extension requires VS Code 1.100 or newer. Release tooling requires Node.js 24 or newer.

Related audit: [#162](https://github.com/bird-chinese-community/BIRD-LSP/issues/162).

### Coordinate extension dependency builds and stdio regressions

Build the extension's dependency closure before workspace tests and avoid rebuilding shared outputs while other test processes use them. Give the complete multi-stage real-stdio ownership regression a bounded execution budget while retaining each state assertion and cleanup step.

PR: [#245](https://github.com/bird-chinese-community/BIRD-LSP/pull/245).
Related issue: [#240](https://github.com/bird-chinese-community/BIRD-LSP/issues/240).

# @birdcc/lsp

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
