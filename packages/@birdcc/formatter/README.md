<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/formatter/assets/icon-256.png" width="96" height="96" alt="@birdcc/formatter" />

# @birdcc/formatter

Formatter for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/formatter?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/formatter)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

`@birdcc/formatter` re-indents BIRD configuration text by block depth and normalizes whitespace. It has two engines that apply the same rules: `dprint` runs the Rust/WASM plugin from [@birdcc/dprint-plugin-bird](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/dprint-plugin-bird) through [@dprint/formatter](https://www.npmjs.com/package/@dprint/formatter), and `builtin` runs in TypeScript on the syntax layout from [@birdcc/parser](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/parser). In safe mode, it rejects any output that parses differently from the input. [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) (`birdcc fmt`), [@birdcc/lsp](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp), and the BIRD2 LSP extension use it.

## Installation

```bash
npm install @birdcc/formatter
```

Requires Node.js 22 or newer. The dprint plugin is a prebuilt WASM file in the `@birdcc/dprint-plugin-bird` dependency, so installation needs no Rust toolchain.

## Usage

```ts
import { checkBirdConfigFormat, formatBirdConfig } from "@birdcc/formatter";

const source = `protocol bgp upstream {
local as 65001;
    neighbor 192.0.2.2 as 65002;   # transit


ipv4 {
import all;
export where net ~ [ 10.0.0.0/8+ ];
};
}
`;

const result = await formatBirdConfig(source);
console.log(result.engine, result.changed);
console.log(result.text);

const { changed } = await checkBirdConfigFormat(result.text);
console.log(changed);
```

Output:

```text
dprint true
protocol bgp upstream {
  local as 65001;
  neighbor 192.0.2.2 as 65002; # transit

  ipv4 {
    import all;
    export where net ~ [ 10.0.0.0/8+ ];
  };
}

false
```

Select the engine and indentation explicitly:

```ts
const result = await formatBirdConfig(source, {
  engine: "builtin",
  useTabs: true,
});
```

## Formatting rules

Both engines apply these rules:

- Indent each line by its nesting depth of `{ }` and `[ ]` blocks, as found by the Tree-sitter grammar. Braces inside strings and comments do not count.
- Collapse consecutive blank lines into one and remove blank lines at the end of the file.
- Convert `\r\n` and `\r` line endings to `\n`, remove trailing spaces and tabs except after a comment, and end the file with one `\n`.
- Keep the lines of a multi-line comment unchanged, including their indentation.

On the remaining lines, the engines also write `name{` as `name {`, remove spaces before a final `;`, and separate a trailing `#` comment from the code with one space. The first two changes skip these lines, which keep their code as written:

- Both engines: lines whose code contains `if`, `then`, `else`, `return`, or one of `~ & | ? : ( [ ]`. The `builtin` engine also checks the text of a trailing comment. The `dprint` engine also keeps the comment spacing of such a line when the line is longer than `lineWidth`.
- `builtin` only: lines longer than `lineWidth`, lines with a parse issue, statements in `filter` and `function` bodies, protocol statements that the parser keeps as text, and `import`/`export where` statements.

The formatter does not join, split, or reorder lines, and it does not change spacing inside the code of a line.

## Options

| Option       | Type                    | Default    | Description                                                                                                                          |
| ------------ | ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `engine`     | `"dprint" \| "builtin"` | `"dprint"` | Formatter engine. See [Engine selection](#engine-selection)                                                                          |
| `indentSize` | `number`                | `2`        | Spaces per indentation level                                                                                                         |
| `useTabs`    | `boolean`               | `false`    | Indent with one tab per level instead of spaces                                                                                      |
| `lineWidth`  | `number`                | `80`       | Line length that changes which lines keep their code as written (see [Formatting rules](#formatting-rules)). Lines are never wrapped |
| `safeMode`   | `boolean`               | `true`     | Reject output whose parse result differs from the input. See [Safe mode](#safe-mode)                                                 |

`indentSize` and `lineWidth` must be positive integers; any other value is replaced with the default. In `bird.config.json`, the same keys live under `formatter`, with `indentSize` limited to 1-16 and `lineWidth` to 20-1000.

## Engine selection

`formatBirdConfig` uses `dprint` unless `options.engine` is `"builtin"`. When the `dprint` engine throws (for example, the plugin fails to load or safe mode rejects its output):

- If you did not pass `engine`, `formatBirdConfig` formats the text again with `builtin` and returns `engine: "builtin"`.
- If you passed `engine: "dprint"`, it throws `Formatting with 'dprint' failed: <reason>`.

An error in the `builtin` engine always throws. The returned `engine` field names the engine that produced the text.

`birdcc fmt` passes `--engine` or `formatter.engine` from `bird.config.json` when one is set, so a configured engine counts as explicit.

## Safe mode

With `safeMode: true`, every changed output is checked before it is returned:

1. The formatter parses the input and the output with @birdcc/parser and builds a fingerprint of each: the declaration tree without source positions and with whitespace in text values collapsed, plus the code and message of every parse issue.
2. If the fingerprints differ, it throws `Formatter safe mode rejected output because semantic fingerprint changed`. If the parser runtime is unavailable, it throws as well.
3. The `dprint` engine also runs a check inside the WASM plugin: it parses both texts with Tree-sitter and compares node kinds, child counts, missing-node flags, and the text of every token. A difference produces `Formatter safe mode rejected output because syntax or token content changed`.

Safe mode does not block files that contain syntax errors. Such a file is formatted when its parse issues are the same before and after formatting.

Output identical to the input skips the check.

## API

| Export                    | Kind     | Description                                                                                                                                              |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatBirdConfig`        | function | `(text: string, options?: FormatBirdConfigOptions) => Promise<BirdFormatResult>`                                                                         |
| `checkBirdConfigFormat`   | function | `(text: string, options?: FormatBirdConfigOptions) => Promise<BirdFormatCheckResult>`; formats the text and reports whether it changed                   |
| `FormatBirdConfigOptions` | type     | `{ engine?; indentSize?; useTabs?; lineWidth?; safeMode? }`                                                                                              |
| `BirdFormatResult`        | type     | `{ text: string; changed: boolean; engine: FormatterEngine }`                                                                                            |
| `BirdFormatCheckResult`   | type     | `{ changed: boolean }`                                                                                                                                   |
| `FormatterEngine`         | type     | `"dprint" \| "builtin"`                                                                                                                                  |
| `BuiltinFormatOutput`     | type     | `{ text: string; stats: BuiltinFormatStats }`                                                                                                            |
| `BuiltinFormatStats`      | type     | Line counters of a `builtin` run: `linesTotal`, `linesTouched`, `blankLinesCollapsed`, `indentationAdjustments`, `highRiskLines`, `parserProtectedLines` |

The exports whose names start with `__` exist for the package tests.

## See also

- [@birdcc/dprint-plugin-bird](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/dprint-plugin-bird): the WASM plugin behind the `dprint` engine, also usable with the dprint CLI.
- [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli): `birdcc fmt` with `--check`, `--write`, and `--engine`.
- [Project configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md)
- [Architecture: formatter](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#formatter)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
