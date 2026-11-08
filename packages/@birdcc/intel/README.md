<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/intel/assets/icon-256.png" width="96" height="96" alt="@birdcc/intel" />

# @birdcc/intel

Bundled ASN database with exact and prefix lookup for BIRD configuration tooling.

[![npm](https://img.shields.io/npm/v/@birdcc/intel?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/intel)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

The package ships `db/asn-db.bin.gz`, a gzip-compressed MessagePack snapshot of AS names, classes, and country codes built from the `asns.csv` file of [BGP.Tools-OpenDB](https://github.com/Alice39s/BGP.Tools-OpenDB). `createAsnIntel()` reads the file synchronously, validates it, and builds in-memory indexes for exact and prefix lookup. [`@birdcc/lsp`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp) uses it for ASN completion, hover, and inlay hints.

## Installation

```bash
npm install @birdcc/intel
```

Requires Node.js 22 or newer.

## Usage

```ts
import { createAsnIntel } from "@birdcc/intel";

const intel = createAsnIntel();
if (!intel.available) {
  throw new Error(`ASN database unavailable: ${intel.failure?.code}`);
}

console.log(intel.exactLookup(13335));
console.log(intel.prefixSearch("1333", 3).map((entry) => entry.asn));
console.log(intel.exactLookup(65001));
```

```text
{ asn: 13335, name: 'Cloudflare, Inc.', cls: 'Content', cc: 'US' }
[ 1333, 13330, 133300 ]
{ asn: 65001, name: 'RFC 6996', cls: 'Reserved', cc: 'ZZ' }
```

Results depend on the bundled snapshot. `prefixSearch(prefix, limit = 10)` matches the decimal form of each ASN: an exact match comes first, followed by the other matches in lexicographic order.

`createAsnIntel()` does not throw when the database cannot be loaded. It returns `available: false`, empty lookups, and a `failure` object whose `code` is `missing`, `read`, `decompress`, `decode`, or `schema`. Pass a path to load another database file: `createAsnIntel("/path/to/asn-db.bin.gz")`.

## Data

The source is `asns/asns.csv` on the `auto-update` branch of BGP.Tools-OpenDB, which refreshes its ASN mapping from bgp.tools daily. The CSV columns are `asn`, `name`, `class`, and `cc`.

`scripts/build-db.ts` removes the `AS` prefix from each ASN, stores the class `Unknown` as an empty string, sorts the rows by ASN, encodes four parallel arrays `[asns, names, classes, ccs]` as MessagePack, and compresses the result with gzip level 9. Each lookup returns an `AsnEntry`:

- `asn`: the AS number.
- `name`: the AS name.
- `cls`: the bgp.tools class, such as `Eyeball`, `Content`, `Carrier`, or `T1`. Empty when the class is unknown.
- `cc`: the two-letter country code, or an empty string.

Before building indexes, the loader rejects a database that decompresses to more than 32 MiB, is empty, holds more than 1,000,000 records, has columns of different lengths, has ASNs that are not integers from 0 to 4294967295 in strictly ascending order, or has a country code that is neither empty nor two uppercase letters. `intel.version` and `failure.version` hold the package version and, once the file has been read, the SHA-256 digest of the compressed file as `contentSha256`.

### Reserved ASNs

`createAsnIntel()` answers reserved ranges from a built-in table with `cls: "Reserved"`, `cc: "ZZ"`, and the defining document as `name`:

- `0`: RFC 7607
- `112`: AS112 Project
- `23456`: RFC 4893
- `64496` to `64511` and `65536` to `131071`: RFC 5398
- `64512` to `65534` and `4200000000` to `4294967294`: RFC 6996
- `65535` and `4294967295`: RFC 7300

`exactLookup` and `lookupDisplay` check this table before the database. `prefixSearch` adds a reserved entry only when the prefix itself is a reserved ASN that is missing from the database results. `loadAsnDatabase` returns database rows only.

## Updating the database

The [`intel-asn-update.yml`](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/.github/workflows/intel-asn-update.yml) workflow runs every Monday at 04:00 UTC and on manual dispatch. It runs `pnpm build:db`, checks that `db/asn-db.bin.gz` exists and is at least 100,000 bytes, and, when the file changed, writes a Tegami changeset that bumps `@birdcc/intel` by a patch version. Unless a manual run sets `dry_run`, it then opens or updates the pull request `chore(intel): Update ASN database` from the `feat/weekly-asn-database` branch. Package versions follow semver, and a merged database update counts as a patch change in the next release.

To rebuild the file locally, run from the repository root:

```bash
pnpm --filter @birdcc/intel build:db
pnpm --filter @birdcc/intel build:db -- --csv /path/to/asns.csv
```

The first command downloads the CSV. The second reads a local copy; a relative path resolves against `packages/@birdcc/intel`.

## Language server

`@birdcc/lsp` calls `createAsnIntel()` once at startup and logs `[intel] ASN database loaded: <count> records` or `[intel] ASN database unavailable: <failure>`. `startLspServer()` accepts `asnDbPath` to load another file and `disableAsnIntel: true` to skip loading; `birdcc lsp` passes neither.

The server treats a number as an ASN in these positions:

- `local as <n>` and `neighbor <address> as <n>`.
- `bgp_path.prepend(<n>)`, `bgp_path.delete(<n>)`, and each number inside `bgp_path ~ [ ... ]`.
- The first number of `community.add((<n>, ...))` and `large_community.add((<n>, ...))`, with or without the `bgp_` prefix, and of `(<n>, <m>) ~ bgp_community`.
- `define <NAME> = <n>` when `NAME` contains `ASN` or `COMMUNITY` as an underscore-separated word, such as `MY_ASN`.

In the community and `define` positions, numbers below 100 other than 42 are ignored. The `community.add` and `~ bgp_community` positions, but not `large_community.add`, also ignore 65535. Hover and inlay hints skip text inside strings and after `#` or `//`. Completion also starts after `# AS<digits>` in a comment.

| Feature     | Content                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Completion  | Up to 10 `prefixSearch` results. The detail is `<flag> AS<n> · <name>`; the documentation is the hover Markdown.  |
| Hover       | Markdown table with AS name and ASN, plus country and class when present, followed by a link to BGP.Tools-OpenDB. |
| Inlay hints | `<flag> AS<n>` after the number. ASNs longer than six digits show their first six digits followed by `..`.        |

`<flag>` is the regional-indicator flag for `cc`, a white flag for reserved ASNs, or nothing when `cc` is empty.

Each feature has a VS Code setting. All default to `true`:

| Setting                      | Effect when `false`                              |
| ---------------------------- | ------------------------------------------------ |
| `bird2-lsp.intel.enabled`    | Turns off ASN completion, hover, and inlay hints |
| `bird2-lsp.intel.completion` | Turns off ASN completion                         |
| `bird2-lsp.intel.hover`      | Turns off ASN hover                              |
| `bird2-lsp.intel.inlayHints` | Turns off ASN inlay hints                        |

Other LSP clients send the same keys in the `bird2-lsp` configuration section, for example `{ "intel": { "enabled": false } }`.

## API

| Export               | Kind     | Description                                                                                                                                                         |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAsnIntel`     | function | `(dbPath?: string) => AsnIntel`. Loads `db/asn-db.bin.gz` from the package unless `dbPath` is given. Returns `available: false` with `failure` instead of throwing. |
| `AsnIntel`           | type     | `available`, `count`, `version?`, `failure?`, `exactLookup(asn)`, `prefixSearch(prefix, limit?)`, `formatDisplay(entry)`, `lookupDisplay(asn)`.                     |
| `loadAsnDatabase`    | function | `(options: AsnDatabaseOptions) => AsnDatabase`. Throws an `Error` whose `cause` is an `AsnDatabaseFailure`.                                                         |
| `formatAsnDisplay`   | function | `(entry: AsnEntry) => AsnDisplayInfo`. Builds the inlay label, completion detail, and hover Markdown.                                                               |
| `countryCodeToFlag`  | function | `(cc: string) => string`. Returns the regional-indicator flag, or an empty string unless `cc` has two characters.                                                   |
| `AsnEntry`           | type     | `{ asn: number; name: string; cls: string; cc: string }`.                                                                                                           |
| `AsnDatabase`        | type     | `{ version; count; loadTimeMs; exactLookup(asn); prefixSearch(prefix, limit?) }`.                                                                                   |
| `AsnDatabaseOptions` | type     | `{ dbPath: string }`.                                                                                                                                               |
| `AsnDisplayInfo`     | type     | `{ inlayLabel: string; completionDetail: string; hoverMarkdown: string }`.                                                                                          |
| `AsnDatabaseFailure` | type     | `{ code; dbPath: string; message: string; version: AsnDatabaseVersion }`.                                                                                           |
| `AsnDatabaseVersion` | type     | `{ packageVersion: string; contentSha256?: string }`.                                                                                                               |

## See also

- [`@birdcc/lsp`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp): language server that queries this package.
- [Architecture: ASN intelligence data flow](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#asn-intelligence-data-flow)
- [BGP.Tools-OpenDB](https://github.com/Alice39s/BGP.Tools-OpenDB): source of `asns.csv`.

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
