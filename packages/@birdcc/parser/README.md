<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/parser/assets/icon-256.png" width="96" height="96" alt="@birdcc/parser" />

# @birdcc/parser

Tree-sitter parser for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/parser?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/parser)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

`@birdcc/parser` parses BIRD configuration text with a Tree-sitter grammar compiled to WebAssembly and loaded through [web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter). `parseBirdConfig` returns a typed declaration tree and a list of parse issues, both with 1-based source ranges. [@birdcc/core](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core), [@birdcc/linter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter), [@birdcc/formatter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter), [@birdcc/lsp](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp), and the BIRD2 LSP extension use it.

## Installation

```bash
npm install @birdcc/parser
```

Requires Node.js 22 or newer. The package ships the compiled grammar as `dist/tree-sitter-birdcc.wasm`, so installation runs no native build.

## Usage

```ts
import { parseBirdConfig } from "@birdcc/parser";

const source = `
router id 192.0.2.1;

protocol bgp upstream {
  local as 65001;
  neighbor 192.0.2.2 as 65002;
  ipv4 {
    import all;
    export none;
  };
}

filter only_default {
  if net = 0.0.0.0/0 then accept;
  reject;
}
`;

const { program, issues } = await parseBirdConfig(source);

for (const declaration of program.declarations) {
  const name = "name" in declaration ? ` ${declaration.name}` : "";
  console.log(`${declaration.kind} ${declaration.line}${name}`);
}
console.log(issues.length);

const broken = await parseBirdConfig(
  "protocol static s1 {\n  route 10.0.0.0/8 blackhole\n",
);
for (const issue of broken.issues) {
  console.log(`${issue.code} ${issue.line}:${issue.column} ${issue.message}`);
}
```

Output:

```text
router-id 2
protocol 4 upstream
filter 13 only_default
0
parser/syntax-error 1:1 Syntax error near 'protocol static s1 { route 10.0.0.0/8 blackhole'
syntax/unbalanced-brace 1:20 Missing '}' to close block
```

`parseBirdConfig` initializes the WASM runtime on the first call and reuses the parser afterwards.

## Parse result

`ParsedBirdDocument` has three fields:

- `program.declarations`: top-level declarations of 14 kinds: `include`, `define`, `router-id`, `graceful-restart-wait`, `hostname-override`, `attribute`, `table`, `mpls-domain`, `timeformat`, `watchdog`, `protocol`, `template`, `filter`, and `function`.
- `issues`: parse issues (see [Parse issues](#parse-issues)).
- `syntaxLayout`: present only when you call `parseBirdConfig(text, { includeSyntaxLayout: true })`. It lists the positions of `{`, `}`, `[`, and `]` tokens, the lines covered by multi-line comments, and the comment start column per line. The `builtin` engine of @birdcc/formatter uses it to compute indentation.

Every node carries `line`, `column`, `endLine`, and `endColumn` (1-based). Named nodes also carry ranges for their parts, such as `nameRange` and `fromTemplateRange`.

Protocol declarations expose `protocolType`, `name`, `fromTemplate`, and `statements`. The parser produces typed statements for these protocol types: `aggregator`, `babel`, `bfd`, `bgp`, `bmp`, `bridge`, `device`, `direct`, `evpn`, `kernel`, `l3vpn`, `mrt`, `ospf` (including `ospf v2` and `ospf v3`), `perf`, `pipe`, `radv`, `rip` (including `rip ng`), `rpki`, and `static`. Channel blocks produce `channel` statements with typed entries. Their `channelType` is `ipv4`, `ipv6`, `ipv4-mpls`, `ipv6-mpls`, `vpn4`, `vpn6`, `vpn4-mpls`, `vpn6-mpls`, `roa4`, `roa6`, `ipv6-sadr`, `flow4`, `flow6`, `mpls`, or `unknown` for other channel types such as `ipv4 multicast`. Space-separated forms such as `ipv6 sadr` map to the hyphenated names. A statement the parser does not model has kind `"other"` and keeps its source text.

Filter and function declarations expose `statements` (`if`, `accept`, `reject`, `return`, `case`, `print`, `unset`, `assignment`, `expression`, `other`), plus the IP and prefix `literals`, `~` `matches`, and function `calls` found in the body. Function declarations add `returnStatements`.

## Parse issues

| Code                       | Reported for                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parser/syntax-error`      | A Tree-sitter error node, input that produces no syntax tree, a misplaced `accept` statement or option, or an invalid ISO `timeformat` style or precision |
| `syntax/missing-semicolon` | A missing `;`                                                                                                                                             |
| `syntax/unbalanced-brace`  | A missing `}`, more `{` than `}` in the source, or a `protocol`, `template`, `filter`, or `function` declaration without its `{`                          |
| `parser/missing-symbol`    | Any other missing token, or a declaration without a required part, such as its name, value, or path                                                       |
| `parser/runtime-error`     | The Tree-sitter runtime or the WASM grammar failed to load                                                                                                |

`parseBirdConfig` does not throw when the runtime fails to load. It returns an empty `program` with one `parser/runtime-error` issue.

## Grammar and WASM

The grammar source is [`grammar.js`](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/parser/grammar.js) (Tree-sitter language name `bird`). The compiled grammar, `src/tree-sitter-birdcc.wasm`, is committed to the repository. `pnpm build` compiles the TypeScript and copies this file to `dist/`; it does not regenerate the grammar. Changes that do not touch `grammar.js` need neither the Tree-sitter CLI nor Emscripten.

After you edit `grammar.js`, regenerate both artifacts from the repository root:

```bash
pnpm --filter @birdcc/parser build:grammar
pnpm --filter @birdcc/parser build:wasm
```

- `build:grammar` runs `tree-sitter generate` with the pinned `tree-sitter-cli` and writes `src/parser.c`, `src/grammar.json`, `src/node-types.json`, and `src/tree_sitter/*.h`. Git ignores these files. The script then formats the package with oxfmt and copies the WASM file to `dist/`.
- `build:wasm` runs `tree-sitter build --wasm` on the generated sources, moves the result to `src/tree-sitter-birdcc.wasm`, and copies it to `dist/`. It requires Emscripten (`emcc`), Docker, or Podman. Without `emcc` on `PATH`, the Tree-sitter CLI runs Emscripten in a Docker or Podman container.

Commit the regenerated `src/tree-sitter-birdcc.wasm` together with `grammar.js`.

To compile the WASM file on another machine over SSH, run `build:grammar` locally first, then:

```bash
pnpm build:parser-wasm:remote --host <ssh-host>
```

The script ([`tools/build-parser-wasm-remote.mjs`](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/tools/build-parser-wasm-remote.mjs)) does the following:

1. Checks that `rsync` exists locally, and that `rsync` and `corepack` exist on the remote host.
2. Copies the working tree to the remote directory with `rsync --delete`, excluding `.git/`, `node_modules/`, `.turbo/`, `.tmp/`, and `dist/`. The generated sources from `build:grammar` are part of this copy.
3. Runs `corepack enable`, `corepack pnpm install --frozen-lockfile`, and `corepack pnpm --filter @birdcc/parser build:wasm` on the remote host. The remote host needs `emcc`, Docker, or Podman.
4. Copies `src/tree-sitter-birdcc.wasm` back.

Use `--remote-dir <path>` to choose the remote working directory, and `--help` to print the options.

## API

| Export               | Kind     | Description                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `parseBirdConfig`    | function | `(input: string, options?: { includeSyntaxLayout?: boolean }) => Promise<ParsedBirdDocument>` |
| `ParsedBirdDocument` | type     | `{ program: BirdProgram; issues: ParseIssue[]; syntaxLayout?: BirdSyntaxLayout }`             |
| `BirdProgram`        | type     | `{ kind: "program"; declarations: BirdDeclaration[] }`                                        |
| `BirdDeclaration`    | type     | Union of the 14 declaration types, such as `ProtocolDeclaration` and `FilterDeclaration`      |
| `ParseIssue`         | type     | `SourceRange` plus `code` (one of the five codes above) and `message`                         |
| `SourceRange`        | type     | `{ line; column; endLine; endColumn }`, 1-based                                               |
| `BirdSyntaxLayout`   | type     | `{ structuralTokens; preservedLines: Set<number>; commentColumns: Map<number, number> }`      |

The package also exports the types of all 14 declarations and of a subset of the protocol statements, channel entries, and filter statements, for example `ProtocolStatement`, `ChannelStatement`, `NeighborStatement`, and `FilterBodyStatement`. See [`src/index.ts`](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/packages/@birdcc/parser/src/index.ts) for the full list.

## See also

- [@birdcc/core](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/core): symbol table, type checks, and include resolution built on this parser.
- [@birdcc/formatter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter): uses `syntaxLayout` for indentation.
- [Architecture: parser](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#parser)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
