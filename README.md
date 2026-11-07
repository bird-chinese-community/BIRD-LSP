<div align="center">

<img src="./packages/@birdcc/vscode/assets/icon-256.png" width="128" height="128" alt="BIRD-LSP" />

# BIRD-LSP

Language server, linter, formatter, and CLI for BIRD 2 and BIRD 3 configuration files.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/BIRDCC.bird2-lsp.svg?label=VS%20Marketplace&color=007ACC&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp)
[![Open VSX](https://img.shields.io/open-vsx/v/BIRDCC/bird2-lsp?style=flat-square&label=Open%20VSX&color=C160EF)](https://open-vsx.org/extension/BIRDCC/bird2-lsp)
[![npm](https://img.shields.io/npm/v/@birdcc/cli?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/cli)
[![CI](https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/ci.yml/badge.svg)](https://github.com/bird-chinese-community/BIRD-LSP/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](./LICENSE)

English | [简体中文](./README.zh.md)

</div>

## Features

- **Parsing**: a Tree-sitter grammar, compiled to WebAssembly, parses BIRD 2 and BIRD 3 configuration files and recovers from syntax errors, so declarations after an error are still analyzed.
- **Diagnostics**: 32 lint rules in six groups (`sym`, `cfg`, `net`, `type`, `bgp`, `ospf`). Analysis follows `include` statements across files, by default up to 16 levels and 256 files. `birdcc lint --bird` also runs `bird -p` on each checked file.
- **Formatting**: two engines, a dprint plugin written in Rust and compiled to WebAssembly (default) and a built-in TypeScript formatter. Safe mode parses the input and the output and rejects the output when the declarations or parse errors differ.
- **Editor features**: completion, keyword and symbol hover, go to definition across included files, find references to templates in `from` clauses across the include graph, document symbols, document formatting, and inlay hints for function return types and AS numbers.
- **ASN data**: `@birdcc/intel` ships an offline AS number database built from BGP.Tools OpenDB. The language server uses it for ASN completion, hover, and inlay hints.
- **Project configuration**: `bird.config.json` sets the entry file or a list of workspaces, include paths, analysis limits, rule severities, formatter options, and the `bird -p` command. `birdcc init` detects the entry file and writes the configuration.

## Getting started

### Editors

| Editor                                                         | Install                                                                                                                                                                                   | Result                                                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VS Code 1.100 or newer, and editors that install from Open VSX | [`BIRDCC.bird2-extension-pack`](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack) ([Open VSX](https://open-vsx.org/extension/BIRDCC/bird2-extension-pack)) | Language features from [`BIRDCC.bird2-lsp`](./packages/@birdcc/vscode/README.md), which bundles the language server, plus syntax highlighting from `BIRDCC.vscode-bird2-conf` |
| Neovim 0.11 or newer                                           | [BIRD.nvim](https://github.com/bird-chinese-community/BIRD.nvim) and `@birdcc/cli`                                                                                                        | Filetype detection and highlighting from BIRD.nvim; language features from `birdcc lsp --stdio` ([configuration](./packages/@birdcc/lsp/README.md#editor-setup))              |
| Vim                                                            | [BIRD.vim](https://github.com/bird-chinese-community/BIRD.vim)                                                                                                                            | Filetype detection and highlighting                                                                                                                                           |
| Helix and other LSP clients                                    | `@birdcc/cli`                                                                                                                                                                             | Language features from `birdcc lsp --stdio` ([configuration](./packages/@birdcc/lsp/README.md#editor-setup))                                                                  |

### CLI

The CLI requires Node.js 22 or newer.

```bash
npm install -g @birdcc/cli

birdcc init --write            # detect the entry file and write bird.config.json
birdcc lint                    # lint the entry file named in bird.config.json
birdcc lint bird.conf --bird   # also run `bird -p`
birdcc fmt bird.conf           # exit 1 if the file needs formatting
birdcc fmt bird.conf --write   # format in place
birdcc lsp --stdio             # start the language server
```

Rules report `warning` or `info` by default. `birdcc lint` exits 1 when a diagnostic has severity `error` and 0 when every diagnostic is `warning` or `info`. The [CLI reference](./packages/@birdcc/cli/README.md) lists every option, the JSON output, and the `bird.config.json` settings that make lint fail a CI job.

### GitHub Actions

[setup-birdcc](https://github.com/bird-chinese-community/setup-birdcc) prepares a GitHub Actions runner with Node.js, pnpm, and BIRD for `birdcc lint`, `birdcc fmt --check`, and `bird -p` jobs.

## Packages

| Package                                                                | Distribution                  | Contents                                                                                           |
| ---------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| [`@birdcc/parser`](./packages/@birdcc/parser/)                         | npm                           | Tree-sitter grammar, WebAssembly build, `parseBirdConfig`                                          |
| [`@birdcc/core`](./packages/@birdcc/core/)                             | npm                           | Symbol table, type checks, cross-file `include` resolution, project configuration, entry detection |
| [`@birdcc/linter`](./packages/@birdcc/linter/)                         | npm                           | 32 lint rules                                                                                      |
| [`@birdcc/formatter`](./packages/@birdcc/formatter/)                   | npm                           | dprint and built-in formatting engines, safe mode                                                  |
| [`@birdcc/dprint-plugin-bird`](./packages/@birdcc/dprint-plugin-bird/) | npm                           | dprint plugin compiled from Rust to WebAssembly                                                    |
| [`@birdcc/intel`](./packages/@birdcc/intel/)                           | npm                           | Offline ASN database                                                                               |
| [`@birdcc/lsp`](./packages/@birdcc/lsp/)                               | npm                           | Language server                                                                                    |
| [`@birdcc/cli`](./packages/@birdcc/cli/)                               | npm                           | `birdcc` command: `init`, `lint`, `fmt`, `lsp`                                                     |
| [`@birdcc/vscode`](./packages/@birdcc/vscode/)                         | VS Code Marketplace, Open VSX | VS Code extension `BIRDCC.bird2-lsp`                                                               |
| [`bird2-extension-pack`](./packages/@birdcc/vscode-pack/)              | VS Code Marketplace, Open VSX | Extension pack `BIRDCC.bird2-extension-pack`: `BIRDCC.bird2-lsp` and `BIRDCC.vscode-bird2-conf`    |

## Architecture

An arrow points from a package to a package it lists in `dependencies`.

```mermaid
flowchart TD
    VSCODE["@birdcc/vscode"]
    CLI["@birdcc/cli"]
    LSP["@birdcc/lsp"]
    LINTER["@birdcc/linter"]
    FORMATTER["@birdcc/formatter"]
    INTEL["@birdcc/intel"]
    CORE["@birdcc/core"]
    DPRINT["@birdcc/dprint-plugin-bird"]
    PARSER["@birdcc/parser"]

    VSCODE --> LSP
    VSCODE --> FORMATTER
    VSCODE --> CORE
    VSCODE --> PARSER
    CLI --> LSP
    CLI --> LINTER
    CLI --> FORMATTER
    CLI --> CORE
    LSP --> LINTER
    LSP --> FORMATTER
    LSP --> INTEL
    LSP --> CORE
    LSP --> PARSER
    LINTER --> CORE
    LINTER --> PARSER
    FORMATTER --> DPRINT
    FORMATTER --> PARSER
    CORE --> PARSER
```

[docs/architecture.md](./docs/architecture.md) describes the diagnostics pipeline, project resolution, formatting engines, and the VS Code extension runtime.

## Development

Requirements:

- Node.js 22 or newer (the release tooling requires Node.js 24)
- pnpm 10.18.3, the version in `packageManager`
- Rust stable with the `wasm32-unknown-unknown` target and the `llvm-tools` component, used to build `@birdcc/dprint-plugin-bird`

```bash
git clone https://github.com/bird-chinese-community/BIRD-LSP.git
cd BIRD-LSP
git submodule update --init --depth 1 refer/BIRD-source-code refer/BIRD-tm-language-grammar refer/BIRD2-vim-grammar
rustup target add wasm32-unknown-unknown
rustup component add llvm-tools
pnpm install
pnpm build
pnpm test
```

| Command                                                 | Runs                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm test:quick`                                       | Package tests without the real-world configuration corpus                 |
| `pnpm typecheck`                                        | TypeScript checks                                                         |
| `pnpm lint`                                             | Oxlint, plus `cargo fmt --check` and `cargo clippy` for the dprint plugin |
| `pnpm exec turbo run format --concurrency=1 -- --check` | Oxfmt check, as in CI                                                     |
| `pnpm format`                                           | Oxfmt, rewriting files                                                    |

Commit messages follow Conventional Commits with a kebab-case scope, for example `fix(parser): Handle nested blocks`. Changes that belong in a package changelog need a Tegami changeset; see [docs/releasing.md](./docs/releasing.md).

## Documentation

- [Project configuration (`bird.config.json`)](./docs/spec.md)
- [Editor settings and validation command rules](./docs/configuration.md)
- [FAQ](./docs/faq.md)
- [Architecture](./docs/architecture.md)
- [Analysis budgets](./docs/analysis-budgets.md)
- [Releases and changesets](./docs/releasing.md)
- BIRD user guide: [BIRD 2](https://bird.network.cz/?get_doc&f=bird.html&v=20), [BIRD 3](https://bird.network.cz/?get_doc&f=bird.html&v=30)

## Feedback

- [Report a bug](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml)
- [Request a feature](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=feature-request.yml)
- [Report a security issue](./SECURITY.md)

## License

[GPL-3.0-only](./LICENSE). BIRD-LSP is maintained by the BIRD Chinese Community (BIRDCC). BIRD is developed by CZ.NIC Labs; this project is not affiliated with CZ.NIC.

## Acknowledgements

<!-- prettier-ignore-start -->

<!-- CI START -->
We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:

- [`PoemaIX/IX-BIRD-RS-Generator`](https://github.com/PoemaIX/IX-BIRD-RS-Generator)
- [`HuJK-Data/JKNET-BIRD`](https://github.com/HuJK-Data/JKNET-BIRD)
- [`@LaunchPad-Network`](https://github.com/LaunchPad-Network) *(private feed)*
- [`186526/net186-config`](https://github.com/186526/net186-config)
- [`SunyzNET/bird-config`](https://github.com/SunyzNET/bird-config)
- [`tianshome/bird-configs-output`](https://github.com/tianshome/bird-configs-output)
<!-- CI END -->

<!-- prettier-ignore-end -->
