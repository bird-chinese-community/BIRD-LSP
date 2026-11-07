<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/dprint-plugin-bird/assets/icon-256.png" width="96" height="96" alt="@birdcc/dprint-plugin-bird" />

# @birdcc/dprint-plugin-bird

dprint plugin for BIRD configuration files, compiled from Rust to WebAssembly.

[![npm](https://img.shields.io/npm/v/@birdcc/dprint-plugin-bird?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/dprint-plugin-bird)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

The plugin is a Rust crate built for the `wasm32-unknown-unknown` target. It parses each file with the Tree-sitter grammar of [`@birdcc/parser`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/parser), sets indentation from brace and bracket depth, and in safe mode parses its own output again to confirm that the syntax tree and tokens are unchanged. The npm package ships the module as `dist/dprint-plugin-bird.wasm`. [`@birdcc/formatter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter) loads it through `@dprint/formatter` for its default `dprint` engine.

## Installation

```bash
npm install @birdcc/dprint-plugin-bird
```

The JavaScript bindings require Node.js 22 or newer. The dprint CLI loads the `.wasm` file itself and does not use them. `npm:` plugin specifiers and additive `associations` require dprint 0.55.0 or newer; the examples below were run with dprint 0.64.3.

## Usage

### dprint CLI

Add the plugin to `dprint.json`. Plugin options go under the `birdcc` key:

```json
{
  "birdcc": {
    "lineWidth": 100,
    "indentWidth": 2,
    "useTabs": false,
    "safeMode": true
  },
  "plugins": ["npm:@birdcc/dprint-plugin-bird/dist/dprint-plugin-bird.wasm"]
}
```

The unversioned `npm:` specifier resolves the package from `node_modules`, searching upward from the directory of `dprint.json`. Two other plugin references load the same module:

- A file path: `"./node_modules/@birdcc/dprint-plugin-bird/dist/dprint-plugin-bird.wasm"`.
- A pinned version, which dprint downloads from the npm registry without a local install: `"npm:@birdcc/dprint-plugin-bird@<version>/dist/dprint-plugin-bird.wasm"`.

Check and format the files:

```bash
dprint check
dprint fmt
```

`dprint check` prints a diff for each unformatted file and exits with a non-zero code. `dprint fmt` rewrites the files.

The plugin claims every file with the `.conf` or `.bird` extension. Use `birdcc.associations` to exclude other `.conf` files or to add more names:

```json
{
  "birdcc": {
    "associations": ["!**/nginx.conf", "**/*.bird3"]
  }
}
```

### JavaScript

`getBuffer()` returns the module bytes for any dprint host. This example uses [`@dprint/formatter`](https://www.npmjs.com/package/@dprint/formatter), which is installed separately:

```ts
import { createContext } from "@dprint/formatter";
import { getBuffer } from "@birdcc/dprint-plugin-bird";

const context = createContext({ lineWidth: 80, indentWidth: 2 });
context.addPlugin(getBuffer(), { safeMode: true });

const output = context.formatText({
  filePath: "bird.conf",
  fileText: "protocol device {\nscan time 10;\n}\n",
});
process.stdout.write(output);
```

```text
protocol device {
  scan time 10;
}
```

`formatText` throws when safe mode rejects the output or when no plugin handles the file extension.

## Options

| Key           | Type               | Default                                  | Description                                                                                                                                                                              |
| ------------- | ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineWidth`   | integer, 0 or more | dprint global `lineWidth`, otherwise 80  | Lines are never wrapped. An expression line (see below) whose formatted length exceeds this value keeps its original text after the indentation, including the spacing before a comment. |
| `indentWidth` | integer, 0 to 255  | dprint global `indentWidth`, otherwise 2 | Spaces per indentation level when `useTabs` is `false`.                                                                                                                                  |
| `useTabs`     | boolean            | dprint global `useTabs`, otherwise false | Indent with one tab per level.                                                                                                                                                           |
| `safeMode`    | boolean            | `true`                                   | Parse the output again and compare node kinds, child counts, missing nodes, and leaf token text with the input. Report an error instead of returning output when they differ.            |

An unknown key produces a configuration diagnostic, and dprint stops with an error. The JSON schema for the `birdcc` object is [`schemas/dprint-plugin-bird.schema.json`](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/schemas/dprint-plugin-bird.schema.json).

## Formatting behavior

- CRLF and CR line endings become LF. Trailing spaces and tabs are removed, except after a comment. Runs of blank lines shrink to one, blank lines at the end of the file are removed, and the file ends with one newline.
- Indentation follows the `{`, `}`, `[`, and `]` tokens of the syntax tree. Braces inside strings and comments do not change the depth.
- Expression lines, whose code contains `if`, `then`, `else`, `return`, `~`, `&`, `|`, `?`, `:`, `(`, `[`, or `]`, are only re-indented. Their code after the indentation is unchanged.
- On all other lines, a trailing `{` gets exactly one space before it and a trailing `;` gets none.
- Code before an inline `#` comment is separated from it by one space, except on an expression line longer than `lineWidth`. The comment text is kept.
- Multi-line comments are copied unchanged.

Line endings inside string literals are converted as well. In safe mode, a file whose string contains a CR therefore produces an error instead of output.

## Build from source

Building the module needs a repository checkout with `pnpm install` completed at the root, plus:

- Rust stable with the `wasm32-unknown-unknown` target and the `llvm-tools` component:

  ```bash
  rustup target add --toolchain stable wasm32-unknown-unknown
  rustup component add --toolchain stable llvm-tools
  ```

- Node.js 22 or newer. `build.rs` runs the package's pinned `tree-sitter-cli` to generate `parser.c` from `packages/@birdcc/parser/grammar.js`.
- A C compiler that can target `wasm32-unknown-unknown`. The `cc` crate compiles the generated parser with it. If the default compiler cannot, set `CC_wasm32_unknown_unknown` to an LLVM `clang` that can.

Build, test, and lint from the repository root:

```bash
pnpm --filter @birdcc/dprint-plugin-bird build
pnpm --filter @birdcc/dprint-plugin-bird test
pnpm --filter @birdcc/dprint-plugin-bird lint
```

`build` runs `scripts/build-wasm.mjs` and then `tsc`. The script calls `cargo build --release --target wasm32-unknown-unknown --features wasm` through `rustup run stable` and copies the result to `dist/dprint-plugin-bird.wasm`. The compiled C parser is archived with the toolchain's `llvm-ar` from `llvm-tools`; set `AR_wasm32_unknown_unknown` to use another archiver. `test` runs `cargo test`. `lint` runs oxlint, `cargo fmt --all --check`, and `cargo clippy --all-targets -- -D warnings`.

## API

| Export      | Kind     | Description                                                                             |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `getPath`   | function | `() => string`. Absolute path of `dist/dprint-plugin-bird.wasm`.                        |
| `getBuffer` | function | `() => Uint8Array`. Reads the module from `getPath()` with `readFileSync` on each call. |

The WebAssembly module reports these values to the dprint host:

- Configuration key: `birdcc`.
- File extensions: `conf`, `bird`.
- Configuration schema: `https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/dprint-plugin-bird.schema.json`.

## See also

- [`@birdcc/formatter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter): formatting API with the `dprint` and `builtin` engines.
- [`@birdcc/parser`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/parser): source of the grammar compiled into the module.
- [Architecture: dprint plugin build and distribution](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#dprint-plugin-build-and-distribution)
- [dprint configuration](https://dprint.dev/config/)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
