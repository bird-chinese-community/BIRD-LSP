# @birdcc/parser

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
