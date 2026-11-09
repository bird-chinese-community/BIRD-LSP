<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/lsp/assets/icon-256.png" width="96" height="96" alt="@birdcc/lsp" />

# @birdcc/lsp

Language server for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/lsp?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/lsp)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

`@birdcc/lsp` implements the Language Server Protocol over stdio with `vscode-languageserver`. It resolves the include graph of each document with [`@birdcc/core`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core), publishes diagnostics from [`@birdcc/linter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter), formats with [`@birdcc/formatter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter), and looks up AS numbers in the database of [`@birdcc/intel`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/intel). The `birdcc lsp` command of [`@birdcc/cli`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) and the BIRD2 LSP VS Code extension run this server.

## Installation

```bash
npm install @birdcc/lsp
```

Requires Node.js 22 or newer. [`@birdcc/cli`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) depends on this package, so `npm install --global @birdcc/cli` also provides the server through `birdcc lsp`.

## Usage

Start the server with one of:

```bash
birdcc lsp --stdio
node node_modules/@birdcc/lsp/dist/server.js --stdio
```

The second command uses a path relative to the project that installed `@birdcc/lsp`; when the editor starts the server from another directory, use the absolute path. The server reads JSON-RPC messages from stdin and writes to stdout. Log lines go to the client as `window/logMessage` notifications. The process exits when the client sends `exit` or closes stdin: with status 0 when `shutdown` came first, and with status 1 otherwise.

## Capabilities

`initialize` returns:

```json
{
  "capabilities": {
    "textDocumentSync": 2,
    "documentSymbolProvider": true,
    "hoverProvider": true,
    "definitionProvider": true,
    "referencesProvider": true,
    "documentFormattingProvider": true,
    "completionProvider": {
      "resolveProvider": false,
      "triggerCharacters": [" ", "."]
    },
    "inlayHintProvider": true
  }
}
```

- Document sync: incremental.
- Diagnostics: published with `textDocument/publishDiagnostics` 120 ms after the last open or change. The server analyzes the include graph of the document's entry file and publishes diagnostics for every file in that graph.
- Completion: 14 keywords and 4 snippets (`include`, `define`, `router id`, `protocol bgp`); names declared in the include graph; filter names after `import filter` and `export filter`, table names after `table`, template names after `from`; include paths already used in the include graph, inside `include "`; AS numbers from the database, up to 10 that start with the typed digits, in `neighbor ... as`, `local as`, `# AS` comments, `define` of a name with an `ASN` or `COMMUNITY` segment, `bgp_path.prepend(`, `bgp_path.delete(`, `bgp_path ~ [`, `community.add((`, and `large_community.add((` (with or without the `bgp_` prefix).
- Hover: keyword documentation with syntax, parameters, and a link to the BIRD user guide; declaration summaries; AS number details (name, country, type).
- Definition and references: go to definition resolves a name to the declaration of the protocol, template, filter, function, table, or `define` constant with that name anywhere in the include graph. Find references returns that declaration plus the `from` clauses that name a template; other uses of filters, functions, tables, protocols, and constants are not reported.
- Document symbols: protocols, templates, filters, functions, `define` constants, tables, attributes, MPLS domains, includes, `router id`, `hostname`, and `graceful restart wait`.
- Formatting: whole-document formatting with [`@birdcc/formatter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter), returned as one text edit.
- Inlay hints: the country flag and AS number after each AS number in `neighbor ... as`, `local as`, `define`, `bgp_path`, and community expressions that the database contains, and the declared or inferred return type after each function name.

Diagnostics carry the rule codes and severities of [`@birdcc/linter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter) (`error` as 1, `warning` as 2, `info` as 3). The server adds three codes of its own:

- `analysis/size-limit` (warning): the document is larger than the analysis budget, 2 MiB by default, and is not analyzed.
- `config/invalid` (error): the project config failed validation; published on the config file.
- `lsp/internal-error` (error): the analysis threw an exception.

The server does not run `bird -p`. `birdcc lint --bird` from [`@birdcc/cli`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) runs BIRD validation.

## Document eligibility

The server analyzes a document when one of these holds:

1. The project config sets `main` to this document.
2. The file name is `bird.conf`, `bird2.conf`, `bird3.conf`, or `bird6.conf`, with or without a leading dot, in any letter case.
3. The parser finds a top-level `router id`, `include`, `define`, `attribute`, `table`, `mpls domain`, `filter`, `function`, `template`, `graceful restart wait`, `hostname`, `timeformat`, `watchdog`, or a `protocol` of a BIRD protocol type (`aggregator`, `babel`, `bfd`, `bgp`, `bmp`, `bridge`, `device`, `direct`, `evpn`, `kernel`, `l3vpn`, `mrt`, `ospf`, `ospf2`, `ospf3`, `perf`, `pipe`, `radv`, `rip`, `rip2`, `ripng`, `rpki`, `static`).

For other documents the server publishes no diagnostics and returns empty results. The server does not check the `languageId` of a document; the client decides which files it sends.

## Project configuration

For each document the server reads the nearest `bird.config.json` (or its alias `birdcc.config.json`) in the document's directory or a parent directory, and picks the entry file of the analysis:

- With `workspaces`, the entry is `bird.conf` in the deepest directory that contains the document and matches a pattern, or in the document's directory when no pattern matches.
- With `main`, the entry is the `main` file.
- Otherwise, or when the selected entry file does not exist, the document is its own entry.

An `include` path resolves relative to the including file first, then relative to the config directory, then to each `includePaths` entry. The server skips include targets outside the workspace root and reports them as `sym/undefined` unless `crossFile.externalIncludes` is `true`. The workspace root is the matched workspace directory with `workspaces`, the config directory with any other config file, and the editor's workspace folder without a config file. Without a config file, the server runs entry detection in the workspace folder that contains the document. When detection selects an entry, the server analyzes it and resolves includes relative to the workspace folder and the entry's directory; otherwise the document is its own entry.

A document that the entry's include graph does not reach is analyzed on its own, and `crossFile.enabled: false` analyzes every document on its own. After `initialized`, the server runs entry detection in each workspace folder that has no config file at its root and reports the result with `window/showMessage`, for example `Auto-detected BIRD entry: bird.conf (100% confidence).`

The server reads `main`, `workspaces`, `includePaths`, `crossFile`, `linter.enabled`, `linter.rules`, and `formatter`; it ignores `linter.withBird` and the `bird` section. When the client supports dynamic registration of `workspace/didChangeWatchedFiles`, the server watches `bird.config.json`, `birdcc.config.json`, `*.conf`, and `*.bird` in each workspace folder and reanalyzes open documents when they change. The [configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md) describes every key.

## Settings

Editor settings come from two places:

- `initializationOptions.birdcc` in the `initialize` request. A value of the wrong type makes `initialize` fail.
- The `bird2-lsp` section of `workspace/configuration`, requested per document when the client advertises `workspace.configuration`. These values override `initializationOptions`. `workspace/didChangeConfiguration` with `settings["bird2-lsp"]` (or `settings.birdcc`) replaces the `initializationOptions` values and reanalyzes open documents.

| Key                            | Type    | Default                    | Effect                                                                                                                         |
| ------------------------------ | ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                      | boolean | `true`                     | `false` stops analysis; every request returns an empty result.                                                                 |
| `performance.maxFileSizeBytes` | integer | unset                      | Document size budget when the project leaves `crossFile.maxDocumentBytes` unset. When both are set, the smaller value applies. |
| `intel.enabled`                | boolean | `true`                     | `false` turns off intelligence features.                                                                                       |
| `intel.hover`                  | boolean | `true`                     | AS number and DN42 IP address hover.                                                                                           |
| `intel.completion`             | boolean | `true`                     | AS number completion.                                                                                                          |
| `intel.inlayHints`             | boolean | `true`                     | AS number inlay hints.                                                                                                         |
| `typeHints.enabled`            | boolean | `true`                     | `false` turns off function return type hints.                                                                                  |
| `typeHints.inlay.enabled`      | boolean | `true`                     | Function return type inlay hints.                                                                                              |
| `formatter.engine`             | string  | `dprint`                   | `dprint` or `builtin`. When unset, a failing `dprint` run falls back to `builtin`.                                             |
| `formatter.indentSize`         | integer | `tabSize` of the request   | Spaces per indentation level, 1 to 16.                                                                                         |
| `formatter.useTabs`            | boolean | opposite of `insertSpaces` | Indent with tabs.                                                                                                              |
| `formatter.lineWidth`          | integer | `80`                       | No line wrapping. The `builtin` engine leaves lines longer than this value unchanged apart from indentation.                   |
| `formatter.safeMode`           | boolean | `true`                     | Fail formatting when the declarations or parser errors of the output differ from the input.                                    |

Set `intel.dn42.enabled` to `true` in user settings to download City and ASN databases to the user's cache directory and refresh them asynchronously. The default is `false`. `intel.enabled` and `intel.hover` also control the hover result.

For formatting, the `formatter` section of the project config overrides these settings, which override the `tabSize` and `insertSpaces` options of the request.

## Editor setup

### Visual Studio Code

Install the BIRD2 LSP extension, `BIRDCC.bird2-lsp`, from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp) or [Open VSX](https://open-vsx.org/extension/BIRDCC/bird2-lsp). It bundles this server and maps its `bird2-lsp.*` settings to the keys above; see the [extension README](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode).

### Neovim

Neovim 0.11 or newer. [BIRD.nvim](https://github.com/bird-chinese-community/BIRD.nvim) registers the `bird2` filetype for `bird.conf`, `bird2.conf`, `bird3.conf`, `bird6.conf`, `*.bird`, `*.bird2`, `*.bird3`, and other `.conf` files whose path or content looks like BIRD configuration.

```lua
vim.lsp.config("birdcc", {
  cmd = { "birdcc", "lsp", "--stdio" },
  filetypes = { "bird2" },
  root_markers = { "bird.config.json", "birdcc.config.json", ".git" },
})
vim.lsp.enable("birdcc")
```

Neovim answers `workspace/configuration` from `settings`. To turn off AS number hover:

```lua
vim.lsp.config("birdcc", {
  settings = {
    ["bird2-lsp"] = {
      intel = { hover = false },
    },
  },
})
```

Without BIRD.nvim, register the filetype yourself:

```lua
vim.filetype.add({
  extension = { bird = "bird2", bird2 = "bird2", bird3 = "bird2" },
  filename = { ["bird.conf"] = "bird2" },
})
```

### Helix

Add a language and a language server to `languages.toml` (`~/.config/helix/languages.toml`, or `.helix/languages.toml` in the project):

```toml
[[language]]
name = "bird2"
scope = "source.bird2"
file-types = [
  "bird",
  "bird2",
  "bird3",
  { glob = "bird.conf" },
  { glob = "bird2.conf" },
  { glob = "bird3.conf" },
  { glob = "bird6.conf" },
]
roots = ["bird.config.json", "birdcc.config.json"]
comment-tokens = "#"
language-servers = ["birdcc"]

[language-server.birdcc]
command = "birdcc"
args = ["lsp", "--stdio"]
```

Helix sends the `config` table of a language server as `initializationOptions`, so settings go under `[language-server.birdcc.config.birdcc]`:

```toml
[language-server.birdcc.config.birdcc.intel]
hover = false
```

## API

```ts
import { startLspServer } from "@birdcc/lsp";

startLspServer({ disableAsnIntel: true });
```

Start the file with `node server.mjs --stdio`; `vscode-languageserver` reads the transport from the process arguments.

```ts
import { lintBirdConfig } from "@birdcc/linter";
import { toLspDiagnostic } from "@birdcc/lsp";

const result = await lintBirdConfig("router id 192.0.2.1;\n");
console.log(result.diagnostics.map(toLspDiagnostic));
```

| Export                                                                                  | Kind     | Description                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startLspServer`                                                                        | function | `(options?: LspServerOptions) => void`. Starts the server.                                                                                                                                                  |
| `LspServerOptions`                                                                      | type     | `{ asnDbPath?: string; disableAsnIntel?: boolean }`. `asnDbPath` replaces the bundled ASN database.                                                                                                         |
| `toLspDiagnostic`                                                                       | function | Converts a `BirdDiagnostic` (1-based) to an LSP `Diagnostic` (0-based).                                                                                                                                     |
| `toInternalErrorDiagnostic`                                                             | function | Wraps an exception as an `lsp/internal-error` diagnostic.                                                                                                                                                   |
| `createCompletionItemsFromParsed`                                                       | function | Completion items for a parsed document and a line prefix.                                                                                                                                                   |
| `CompletionContextOptions`                                                              | type     | `{ linePrefix?: string; additionalDeclarations?: BirdDeclaration[] }`.                                                                                                                                      |
| `createHoverFromParsed`, `resolveKeywordHoverOnLine`, `resolveHoverContextPath`         | function | Hover content for declarations and keywords.                                                                                                                                                                |
| `KeywordHoverResolutionOptions`, `ResolvedKeywordHover`, `HoverContextDocumentLike`     | type     | Types of the hover functions.                                                                                                                                                                               |
| `createDefinitionLocations`, `createReferenceLocations`                                 | function | Locations from a `SymbolTable` of [`@birdcc/core`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core).                                                                     |
| `createDocumentSymbolsFromParsed`                                                       | function | Document symbols for a parsed document.                                                                                                                                                                     |
| `createAsnCompletionItems`, `extractAsnPrefix`, `createAsnHover`, `createAsnInlayHints` | function | AS number features. `extractAsnPrefix` reads a line prefix; the other three take an `AsnIntel` from [`@birdcc/intel`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/intel). |
| `evaluateLspDocumentEligibility`                                                        | function | Applies the [document eligibility](#document-eligibility) rules.                                                                                                                                            |
| `toLspRange`, `isPositionInRange`, `getLineText`, `toCanonicalKey`                      | function | Range and text helpers.                                                                                                                                                                                     |
| `SourceRangeLike`, `GetLineTextDocument`                                                | type     | Inputs of the range and text helpers.                                                                                                                                                                       |

## See also

- [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli): `birdcc lsp --stdio` and command-line linting.
- [@birdcc/vscode](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode): the BIRD2 LSP extension.
- [Project configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md)
- [Architecture: LSP diagnostics pipeline](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#lsp-diagnostics-pipeline)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
