## @birdcc/intel@1.1.0

### Add optional DN42 IP and ASN intelligence

Add user-enabled DN42 IP and ASN hover with English location names, prefix-scoped service and DNS observations, and registry-derived origin policy. VS Code shows the hover as a property sheet with theme-colored result icons; other clients receive the same layout in Markdown. Use DN42-IPDB-SDK to download and verify the database bundle in the background through the proxy environment variables, retain loaded data on update failure, and check for updates daily while enabled.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/254

### Document current package behavior

Describe each package from its current sources: CLI commands, options, exit codes, and JSON output; the lint rule catalog with default severities; formatter engines and options; language server capabilities and settings; and the VS Code extension's settings, commands, and snippets.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/250

## @birdcc/intel@1.0.0

### Validate ASN database content and report loading failures

Validate decoded ASN database columns and expose structured load failures with the package version and database content digest.

PR: [#236](https://github.com/bird-chinese-community/BIRD-LSP/pull/236).
Issues: [#206](https://github.com/bird-chinese-community/BIRD-LSP/issues/206), [#207](https://github.com/bird-chinese-community/BIRD-LSP/issues/207).

### Check formatting in CI without changing workspace files

Run package formatting tasks with `--check` in CI. Keep generated README sections owned by their synchronization workflow.

PR: [#226](https://github.com/bird-chinese-community/BIRD-LSP/pull/226).
Issue: [#203](https://github.com/bird-chinese-community/BIRD-LSP/issues/203).

### Release the BIRDCC toolchain as 1.0.0

Coordinate the parser, semantic analysis, linter, formatter, language server, CLI, ASN data package, VS Code extension, extension pack, and Rust formatter metadata at version 1.0.0.

Use Tegami changesets for package changelogs, version plans, and resumable npm releases. Keep original Issue and PR links in each change entry. Version the private editor packages for their VSIX releases and the Rust crate for its bundled WASM artifact.

Include root Cargo workspace manifests and lockfiles in build cache inputs so Rust dependency and profile changes rebuild the shipped formatter.

The VS Code extension requires VS Code 1.100 or newer. Release tooling requires Node.js 24 or newer.

Related audit: [#162](https://github.com/bird-chinese-community/BIRD-LSP/issues/162).
