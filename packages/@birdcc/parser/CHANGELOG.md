## @birdcc/parser@1.0.0

### Preserve syntax while formatting

Use Tree-sitter syntax boundaries for indentation in both formatters and verify syntax and token contents when `safeMode` is enabled in the direct WASM plugin.

PR: [#228](https://github.com/bird-chinese-community/BIRD-LSP/pull/228).
Issues: [#190](https://github.com/bird-chinese-community/BIRD-LSP/issues/190), [#191](https://github.com/bird-chinese-community/BIRD-LSP/issues/191).

### Coordinate parser and language-client dependency updates

Group the Tree-sitter CLI and runtime updates so grammar generation and the shipped WASM runtime can be verified together. Group the language client and server SDK updates for coordinated protocol and editor-host validation.

PR: [#227](https://github.com/bird-chinese-community/BIRD-LSP/pull/227).
Issues: [#204](https://github.com/bird-chinese-community/BIRD-LSP/issues/204), [#205](https://github.com/bird-chinese-community/BIRD-LSP/issues/205).

### Preserve symbol identity and infer parsed returns

Resolve user symbols with case-sensitive names across declarations, inheritance, diagnostics, and navigation. Infer function return hints from parsed return statements, including nested control flow.

PR: [#224](https://github.com/bird-chinese-community/BIRD-LSP/pull/224).
Issues: [#192](https://github.com/bird-chinese-community/BIRD-LSP/issues/192), [#193](https://github.com/bird-chinese-community/BIRD-LSP/issues/193).

### Refresh public configuration examples

Refresh the public reference configuration corpus and its pinned CI input metadata used by parser, formatter, lint, and analysis checks.

Commit: [618394f4](https://github.com/bird-chinese-community/BIRD-LSP/commit/618394f4a79082dd374eb82d26acb9e38abdebf3).

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

# @birdcc/parser

## 0.1.2

### Patch Changes

- [#159](https://github.com/bird-chinese-community/BIRD-LSP/pull/159) [`d124c20`](https://github.com/bird-chinese-community/BIRD-LSP/commit/d124c20028a9adb6a1d6b0bcb8c341b73c8266e2) Thanks [@Alice39s](https://github.com/Alice39s)! - Give filter expressions BIRD's operator precedence: `*` and `/` bind tighter than `+` and `-`, which bind tighter than comparisons and `~`. Previously all of them shared one level and were grouped left to right, so `a + 1 > b * 2` was parsed as `((a + 1) > b) * 2`.

## 0.1.1

### Patch Changes

- Show each package's new BIRDCC brand icon at the top of its README.

## 0.1.0

### Patch Changes

- [#148](https://github.com/bird-chinese-community/BIRD-LSP/pull/148) [`c2b5061`](https://github.com/bird-chinese-community/BIRD-LSP/commit/c2b506177125deffba32db8e2add1ce6deca87f8) Thanks [@Alice39s](https://github.com/Alice39s)! - Synchronize the Tree-sitter parser with the BIRD TextMate grammar at upstream
  commit `306f00b`, covering the BIRD 2.19 and BIRD 3.3 syntax additions shipped
  by the editor integration.

  ## Grammar coverage

  The parser now recognizes these forms without degrading them to generic
  statements:

  ```bird
  router id from "Lo*";
  table custom_table {
    sorted yes;
  }
  thread group worker {
    threads 2;
  }
  timeformat log iso long us;
  protocol rip ng rip6 {
    ipv6;
  }
  protocol bgp edge {
    ipv4 multicast;
    neighbor range 192.0.2.0/24 external onlink as 65000 port 179;
  }
  protocol bfd control {
    accept;
    accept ipv4 multihop;
  }
  protocol static flows {
    route flow4 {
      dst 10.0.0.0/8;
      port > 24 && < 30;
    };
  }
  ```

  Additional grammar changes include comma-delimited option blocks (e.g.
  `log ... { trace, info };`) and the CLI form of ISO time formats. Bare
  top-level `flow4`/`flow6` blocks are rejected; see Diagnostics below.

  ## Parser declarations and public types
  - `RouterIdDeclaration.fromSource` now accepts interface patterns in addition
    to `routing` and `dynamic`. Quotes are removed, while case-sensitive source
    spelling is preserved instead of being normalized to lowercase.
  - ISO `TimeformatDeclaration` values use `format: "iso"` and retain the full
    specification, such as `iso long us`, in `formatText` and `formatRange`.
    `limit`, `limitRange`, `fallbackFormat`, `fallbackFormatText`, and
    `fallbackFormatRange` stay unset for ISO declarations instead of receiving
    shifted style or precision tokens.
  - `NeighborStatement` adds required `isRange` and `onlink` flags, optional
    `peerType`, `peerTypeRange`, and `onlinkRange` fields, and the new
    `addressKind: "prefix"` variant. Repeated `as` and `port` options follow BIRD
    source order, with the final value exposed through `asn` or `port`.
  - BFD accepts are extracted as `bfd-option` statements for both `accept;` and
    option-bearing forms. Family and session-type modifiers stay in the existing
    `families` and `sessionTypes` arrays.

  TypeScript consumers that construct `NeighborStatement` objects directly must
  now provide `isRange` and `onlink`. Exhaustive checks of `addressKind` should
  also handle the new `"prefix"` variant.

  ## Diagnostics and lint behavior
  - Option-bearing `accept` statements in filters or non-BFD protocol bodies now
    produce `parser/syntax-error` diagnostics instead of becoming structured
    filter acceptance. Password `accept from` and `accept to` bounds remain valid
    inside password blocks, but are rejected as direct BFD options.
  - Incomplete ISO time formats and unsupported top-level FlowSpec blocks are
    syntax errors.
  - `cfg/incompatible-type` now expects a prefix for `neighbor range` and an IP
    literal for ordinary neighbors.
  - `bgp/missing-remote-as` accepts explicit `internal` or `external` peer types
    without requiring an additional `as` clause, and `bgp/as-mismatch` recognizes
    the structured `internal` peer type.
