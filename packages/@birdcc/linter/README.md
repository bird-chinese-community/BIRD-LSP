<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/linter/assets/icon-256.png" width="96" height="96" alt="@birdcc/linter" />

# @birdcc/linter

Rule-based linter for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/linter?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/linter)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

`@birdcc/linter` checks a BIRD configuration against 32 rules in six groups: `sym`, `cfg`, `net`, `type`, `bgp`, and `ospf`. It parses the text with [@birdcc/parser](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/parser), builds a snapshot with [@birdcc/core](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core), reports parser and core diagnostics under rule codes, and runs the rule functions. [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) (`birdcc lint`) and [@birdcc/lsp](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp) use it.

## Installation

```bash
npm install @birdcc/linter
```

Requires Node.js 22 or newer.

## Usage

Lint one document. `lintBirdConfig` is async:

```ts
import { lintBirdConfig } from "@birdcc/linter";

const source = `
router id 192.0.2.1;

protocol bgp upstream {
  neighbor 192.0.2.2 as 65002;
  ipv4 { import filter missing_filter; };
}
`;

const result = await lintBirdConfig(source, {
  uri: "file:///etc/bird/bird.conf",
});
for (const diagnostic of result.diagnostics) {
  const { line, column } = diagnostic.range;
  console.log(
    `${diagnostic.severity} ${diagnostic.code} ${line}:${column} ${diagnostic.message}`,
  );
}
```

Output:

```text
warning sym/filter-required 6:24 Protocol 'upstream' references unknown filter 'missing_filter'
info bgp/missing-local-as 4:14 BGP protocol 'upstream' missing local AS number
```

Lint an include graph resolved by `@birdcc/core`. Symbols defined in one file satisfy references in another:

```ts
import { resolveCrossFileReferences } from "@birdcc/core";
import { lintBirdConfig, lintResolvedCrossFileGraph } from "@birdcc/linter";

const documents = [
  {
    uri: "file:///etc/bird/bird.conf",
    text: `router id 192.0.2.1;
include "templates.conf";
protocol bgp upstream from peer_base { neighbor 192.0.2.2 as 65002; }
`,
  },
  {
    uri: "file:///etc/bird/templates.conf",
    text: "template bgp peer_base { local as 65001; }\n",
  },
];

const single = await lintBirdConfig(documents[0].text, {
  uri: documents[0].uri,
});
console.log(single.diagnostics.map((diagnostic) => diagnostic.code));

const graph = await resolveCrossFileReferences({
  entryUri: documents[0].uri,
  documents,
  loadFromFileSystem: false,
});
const { diagnostics, byUri } = await lintResolvedCrossFileGraph(graph);
console.log(diagnostics.map((diagnostic) => diagnostic.code));
console.log(Object.keys(byUri));
```

Output:

```text
[ 'sym/undefined' ]
[]
[ 'file:///etc/bird/bird.conf', 'file:///etc/bird/templates.conf' ]
```

## Rules

Default severities: `sym/*`, `cfg/*`, `net/*`, and `type/*` rules report `warning`; `bgp/*` and `ospf/*` rules report `info`. One check reports `error`: `cfg/number-expected` for a BGP `neighbor` statement that the parser keeps as unstructured text and whose `as` value is not a number.

### Symbols (`sym/*`)

| Rule                      | Default | Reported for                                                                                                                                                                                                                                                      |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sym/undefined`           | warning | A `from` template that is not defined, or an include that cannot be loaded                                                                                                                                                                                        |
| `sym/duplicate`           | warning | A second definition with the same kind and name                                                                                                                                                                                                                   |
| `sym/proto-type-mismatch` | warning | A protocol that inherits from a template of another protocol type                                                                                                                                                                                                 |
| `sym/filter-required`     | warning | An `import filter` or `export filter` clause without a name, or naming an undefined filter                                                                                                                                                                        |
| `sym/function-required`   | warning | A call to a function that is not declared and not on the linter's list of known built-ins, such as `roa_check` and `defined`. Built-ins missing from the list, such as `aspa_check`, are reported                                                                 |
| `sym/table-required`      | warning | A `table` clause without a name, or naming an undefined table                                                                                                                                                                                                     |
| `sym/variable-scope`      | warning | An assignment in a filter or function to a name not declared earlier in the body; see `type/undefined-variable` in [@birdcc/core](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core#diagnostics) for the exempt route attributes |

### Configuration (`cfg/*`)

| Rule                        | Default | Reported for                                                                                                                                                                                                                 |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cfg/no-protocol`           | warning | A file with no `protocol` and no `define`, `include`, `function`, `template`, or `table` declaration                                                                                                                         |
| `cfg/missing-router-id`     | warning | A file with a BGP protocol not based on a template, and no `router id`, `include`, or `define`                                                                                                                               |
| `cfg/syntax-error`          | warning | Any parse issue from @birdcc/parser                                                                                                                                                                                          |
| `cfg/value-out-of-range`    | warning | `local as` or `neighbor ... as` outside 1-4294967294; a channel `limit` or `max prefix` outside 0-4294967295; `hold` (3-65535), `keepalive` (1-65535), or `ttl` (1-255) out of range in a statement the parser keeps as text |
| `cfg/switch-value-expected` | warning | A non-boolean value after `passive`, `stub`, `bfd`, `enabled`, `disabled`, `check link`, `deterministic med`, or a channel `keep filtered`                                                                                   |
| `cfg/number-expected`       | warning | A non-numeric value for one of the options above; constant names with an upper-case letter or `_`, and `internal`/`external`/`ibgp`/`ebgp` for AS values, are accepted                                                       |
| `cfg/incompatible-type`     | warning | A `neighbor` address that is not an IP address (or not a prefix for `neighbor range`), or a `router id` value that @birdcc/core rejects (`semantic/invalid-router-id`)                                                       |
| `cfg/ip-network-mismatch`   | warning | An IPv6 address in an unstructured `ipv4` channel option, or an IPv4 address in an `ipv6` one                                                                                                                                |
| `cfg/circular-template`     | warning | A template inheritance cycle                                                                                                                                                                                                 |

### Networks (`net/*`)

| Rule                        | Default | Reported for                                                                                                                                             |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `net/invalid-prefix-length` | warning | A prefix literal in a filter or function that is not valid CIDR, a length range whose minimum exceeds its maximum, or a non-numeric channel `max prefix` |
| `net/invalid-ipv4-prefix`   | warning | A dotted prefix whose address is not a valid IPv4 address, or a prefix whose address contains neither `.` nor `:`                                        |
| `net/invalid-ipv6-prefix`   | warning | A prefix containing `:` whose address is not a valid IPv6 address                                                                                        |
| `net/max-prefix-length`     | warning | An IPv4 prefix length or length range above 32, or a channel `max prefix` above 32 (`ipv4`) or 128 (`ipv6`)                                              |

### Types (`type/*`)

| Rule                    | Default | Reported for                                                                                                       |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `type/mismatch`         | warning | A typed local variable declared or assigned with a value of another type                                           |
| `type/not-iterable`     | warning | The right side of `~` is not a `[...]` set, a `(a, b)` tuple, an IP address, a prefix or prefix pattern, or a name |
| `type/set-incompatible` | warning | The left side of `~` has a different type than the first element of the set literal                                |

### BGP (`bgp/*`)

| Rule                    | Default | Reported for                                                                                                       |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `bgp/missing-local-as`  | info    | A BGP protocol without `local as` and without a template                                                           |
| `bgp/missing-neighbor`  | info    | A BGP protocol without `neighbor` and without a template                                                           |
| `bgp/missing-remote-as` | info    | A `neighbor` without an AS number, `internal`, or `external`, in a protocol not based on a template                |
| `bgp/as-mismatch`       | info    | A protocol with an internal neighbor and a neighbor AS number different from `local as`                            |
| `bgp/timer-invalid`     | info    | `hold time` outside 3-65535, `keepalive time` outside 1-65535 (0 disables either), or `keepalive` not below `hold` |

### OSPF (`ospf/*`)

| Rule                     | Default | Reported for                                              |
| ------------------------ | ------- | --------------------------------------------------------- |
| `ospf/missing-area`      | info    | An OSPF protocol without an `area`                        |
| `ospf/backbone-stub`     | info    | The backbone area (`0` or `0.0.0.0`) configured as `stub` |
| `ospf/vlink-in-backbone` | info    | A virtual link inside the backbone area                   |
| `ospf/asbr-stub-area`    | info    | An ASBR declared inside a stub area                       |

### Parser and core diagnostics

The linter reports diagnostics from @birdcc/parser and @birdcc/core under rule codes. When the original code differs from the rule code, the message starts with the original code, for example `[semantic/duplicate-definition] protocol 'd1' is already defined`:

| Original code                                                                                | Rule code                   |
| -------------------------------------------------------------------------------------------- | --------------------------- |
| All five parser issue codes                                                                  | `cfg/syntax-error`          |
| `semantic/duplicate-definition`                                                              | `sym/duplicate`             |
| `semantic/undefined-reference`, `semantic/missing-include`                                   | `sym/undefined`             |
| `semantic/circular-template`                                                                 | `cfg/circular-template`     |
| `semantic/invalid-router-id`, `semantic/invalid-neighbor-address`, `type/unknown-expression` | `cfg/incompatible-type`     |
| `semantic/invalid-cidr`                                                                      | `net/invalid-prefix-length` |
| `type/mismatch`                                                                              | `type/mismatch`             |
| `type/undefined-variable`                                                                    | `sym/variable-scope`        |

### File roles

`lintBirdConfig` infers a role for each file from its URI and content. `bird.conf`, `bird2.conf`, and `bird3.conf` are entry files, and so is a file with a `router id` or `include` declaration unless its directory marks it as a fragment or library. Other files become fragments or libraries based on directory and file-name markers (such as `peers`, `upstream`, `filters`, `lib`), on whether their directory or a parent directory holds an entry file, and on whether they declare named protocols; a file that none of these checks classifies is an entry file. Without a URI, or with a `memory://` URI, the role is `unknown` and no diagnostics are dropped. For fragments and libraries, the linter drops `sym/undefined`, `sym/function-required`, `sym/filter-required`, `sym/table-required`, `cfg/no-protocol`, and `cfg/missing-router-id`, because the definitions they need live in other files. `lintResolvedCrossFileGraph` also drops `cfg/no-protocol` and `cfg/missing-router-id` for every file except the entry.

## Configuring severity

`lintBirdConfig` returns the default severities. The CLI and the language server apply `linter.rules` from `bird.config.json` (or its alias `birdcc.config.json`) to the result:

```json
{
  "linter": {
    "rules": {
      "cfg/*": "error",
      "cfg/syntax-error": "off",
      "sym/filter-required": "info"
    }
  }
}
```

- A key that equals the rule code wins.
- Otherwise the longest matching key that ends in `/*` applies; `cfg/*` matches every `cfg/` rule. Other wildcard forms, such as `*` alone, match nothing.
- Values are `error`, `warning`, `info`, and `off`. `off` removes the diagnostic.
- `"linter": { "enabled": false }` removes all diagnostics.

Keys match rule codes, not the original parser or core codes.

To apply the same configuration in your own code, pass the diagnostics to `applyLintConfiguration` from `@birdcc/core`:

```ts
import { applyLintConfiguration } from "@birdcc/core";
import { lintBirdConfig } from "@birdcc/linter";

const { diagnostics } = await lintBirdConfig(
  "router id 192.0.2.1;\nprotocol bgp upstream {\n  neighbor 192.0.2.2 as 65002;\n  ipv4 { import filter missing_filter; };\n}\n",
);
const configured = applyLintConfiguration(diagnostics, {
  rules: { "sym/*": "error", "bgp/missing-local-as": "off" },
});
console.log(
  configured.map((diagnostic) => `${diagnostic.severity} ${diagnostic.code}`),
);
```

Output:

```text
[ 'error sym/filter-required' ]
```

### Failing CI on lint findings

`birdcc lint` exits with status 1 only when a diagnostic has severity `error`. With the default severities, a file with syntax errors or undefined filters exits with 0. To fail the build on symbol, configuration, network, and type findings, raise those groups to `error` in `bird.config.json`:

```json
{
  "main": "bird.conf",
  "linter": {
    "rules": {
      "sym/*": "error",
      "cfg/*": "error",
      "net/*": "error",
      "type/*": "error"
    }
  }
}
```

```bash
birdcc lint bird.conf
echo $?
```

For a `bird.conf` with a missing `;` and an undefined filter, the output is:

```text
ERROR cfg/syntax-error [file:///.../bird.conf] 4:15 [syntax/missing-semicolon] Missing ';' at end of statement
ERROR sym/filter-required [file:///.../bird.conf] 10:24 Protocol 'upstream' references unknown filter 'missing_filter'
1
```

Without the `linter.rules` block, the same file prints both lines as `WARNING` and exits with 0.

## API

| Export                       | Kind     | Description                                                                                                                      |
| ---------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `lintBirdConfig`             | function | `(text: string, options?: LintBirdConfigOptions) => Promise<LintResult>`                                                         |
| `lintResolvedCrossFileGraph` | function | `(resolution: CrossFileResolutionResult) => Promise<CrossFileLintResult>`; lints every visited file with the merged symbol table |
| `LintBirdConfigOptions`      | type     | `{ parsed?: ParsedBirdDocument; core?: CoreSnapshot; uri?: string }`; pass `parsed` or `core` to reuse earlier results           |
| `LintResult`                 | type     | `{ parsed: ParsedBirdDocument; core: CoreSnapshot; diagnostics: BirdDiagnostic[] }`                                              |
| `CrossFileLintResult`        | type     | `{ diagnostics: BirdDiagnostic[]; byUri: Record<string, LintResult> }`                                                           |

`BirdDiagnostic`, `CoreSnapshot`, and `CrossFileResolutionResult` come from `@birdcc/core`. The rule set is fixed; the package does not export an API for adding rules.

## See also

- [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli): `birdcc lint` options, output formats, and exit codes.
- [@birdcc/core](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core#diagnostics): the semantic diagnostics behind `sym/*` and `type/*` rules.
- [Project configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md)
- [Architecture: linter](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#linter)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
