<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/cli/assets/icon-256.png" width="96" height="96" alt="@birdcc/cli" />

# @birdcc/cli

Command-line linter, formatter, and project setup tool for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/cli?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/cli)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

The `birdcc` command lints BIRD configurations with the 32 rules of [`@birdcc/linter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter), following `include` statements across files, and can add the errors reported by `bird -p` to the same result. It formats files with [`@birdcc/formatter`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter), writes `bird.config.json` from entry-file detection, and starts the [`@birdcc/lsp`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp) language server over stdio. Project settings come from the nearest `bird.config.json`.

## Installation

```bash
npm install --global @birdcc/cli
```

Requires Node.js 22 or newer. To pin the version per project, run `npm install --save-dev @birdcc/cli` and call the command as `npx birdcc`. To run it without installing, use `npx @birdcc/cli lint bird.conf`.

## Usage

```bash
birdcc init --write
birdcc lint
birdcc fmt --write
```

`birdcc init --write` detects the entry file and writes `bird.config.json`. Without a file argument, `lint` and `fmt` use the `main` entry from that file.

## Commands

| Command              | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `birdcc lint [file]` | Lint a configuration and its include graph.            |
| `birdcc fmt [file]`  | Check or rewrite the formatting of one file.           |
| `birdcc init [root]` | Detect the entry file and generate `bird.config.json`. |
| `birdcc lsp --stdio` | Start the language server on stdin and stdout.         |

Global options:

| Option            | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `-v`, `--verbose` | Print progress and timing to stderr, prefixed with `[verbose]`.              |
| `--debug-json`    | Add a `debug` object or extra fields to the JSON output of `lint` and `fmt`. |
| `-h`, `--help`    | Print help for the command.                                                  |

`birdcc` has no `--version` option; `-v` means `--verbose`.

### `birdcc lint [file]`

| Option                         | Default                                 | Description                                                                                  |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `--format <format>`            | `text`                                  | `text` or `json`. Other values exit with status 1.                                           |
| `--json`                       | off                                     | Same as `--format json`; takes precedence over `--format`.                                   |
| `--bird`                       | off                                     | Also run the BIRD validation command. `linter.withBird: true` turns this on from the config. |
| `--cross-file`                 | on                                      | Analyze the include graph. `--no-cross-file` or `crossFile.enabled: false` turns it off.     |
| `--include-max-depth <n>`      | `crossFile.maxDepth`, else 16           | Maximum include nesting depth.                                                               |
| `--include-max-files <n>`      | `crossFile.maxFiles`, else 256          | Maximum number of files in the include graph.                                                |
| `--validate-command <command>` | see [BIRD validation](#bird-validation) | Command template for `--bird`.                                                               |

Target files:

- With `file`, birdcc lints that file and reads settings from the nearest `bird.config.json` in the file's directory or a parent directory.
- Without `file`, birdcc searches for `bird.config.json` from the current directory upward and lints its `main` entry (`bird.conf` when `main` is unset). When the config sets `workspaces`, it lints the `bird.conf` of every matching directory. Without a config file the command fails.

Cross-file analysis (default):

- A file that contains an `include` statement is the entry of the analyzed include graph.
- For any other file, birdcc runs entry detection in the file's directory and up to four parent directories, then analyzes the include graph of the detected entry, or of the file itself when detection finds no entry. The output lists the diagnostics of that include graph; when the detected entry does not include the file, the output has none for that file. Lint such a file with `--no-cross-file`.
- An `include` path resolves relative to the including file first. birdcc then tries the search paths in order: the detected project directory and the entry's directory (only the file's own directory when the file contains an `include`), followed by each `includePaths` entry.
- birdcc skips include targets outside the workspace root and reports them as `sym/undefined` unless `crossFile.externalIncludes` is `true`. The workspace root is the file's directory when the file contains an `include` or detection finds no entry, and the detected project directory otherwise. For example, with `"main": "configs/main.conf"` and `"includePaths": ["./filters"]`, files in `filters/` are outside the root.

Output: one line per diagnostic with severity, rule code, file URI (absent for BIRD validation diagnostics), 1-based line and column, and message. Without diagnostics the command prints `No problems found during linting`.

```text
WARNING sym/filter-required [file:///srv/bird/bird.conf] 10:19 Protocol 'upstream' references unknown filter 'peer_in'
```

Default severities are `warning` for the `sym`, `cfg`, `net`, and `type` rules and `info` for the `bgp` and `ospf` rules. A diagnostic with severity `error` makes the command exit with status 1; when all diagnostics are `warning` or `info`, it exits with status 0. Failures such as an unreadable file also exit with status 1; see [Exit codes](#exit-codes) and [Use in CI](#use-in-ci).

#### BIRD validation

`--bird` runs a validation command after the static analysis and adds its errors to the result. birdcc takes the command template from the first of:

1. `--validate-command`
2. `bird.validateCommand` in `bird.config.json`
3. `bird.binaryPath`, as `<binaryPath> -p -c {file}`
4. the `BIRD_BIN` environment variable, as `"<BIRD_BIN>" -p -c {file}`
5. `bird -p -c {file}`

```bash
BIRD_BIN=/usr/sbin/bird birdcc lint bird.conf --bird
birdcc lint bird.conf --bird --validate-command "/usr/sbin/bird -p -c {file}"
```

birdcc splits the template on whitespace (single and double quotes group words), replaces `{file}` with the absolute path of the linted file, and appends the path when the template has no `{file}`. It runs the command without a shell, in the directory of the linted file, with a 10-second timeout. birdcc does not run the command when the file path contains `;`, `|`, `&`, `$`, `<`, `>`, a backtick, or a control character.

stderr lines in the forms `<file>:<line>:<column> <message>`, `Parse error <file>, line <line>: <message>`, and `<file>, line <line>:<column> <message>` become `bird/parse-error` diagnostics; other non-empty stderr lines become `bird/parse-error` at line 1. An unsafe file path, a template with an unclosed quote, a command that cannot start or times out, and a non-zero exit without stderr output produce `bird/runner-error`. Both codes have severity `error`.

### `birdcc fmt [file]`

| Option              | Default                           | Description                                                                   |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `--check`           | off                               | Check only. Checking is also the behavior without `--write`.                  |
| `--write`           | off                               | Write the formatted text back to the file. Cannot be combined with `--check`. |
| `--engine <engine>` | `formatter.engine`, else `dprint` | `dprint` or `builtin`.                                                        |
| `--json`            | off                               | Print `{ "changed", "filePath" }` instead of a message.                       |

```bash
birdcc fmt bird.conf --check
birdcc fmt bird.conf --write --engine builtin
```

- `fmt` formats one file. Without `file` it uses `main` from the nearest `bird.config.json` (`bird.conf` when `main` is unset); when the config sets `workspaces`, pass a file explicitly. A directory argument is an error.
- Formatting options come from the `formatter` section of `bird.config.json`: `indentSize` (default 2), `lineWidth` (80), `useTabs` (`false`), and `safeMode` (`true`).
- When neither `--engine` nor `formatter.engine` is set and the `dprint` engine fails, birdcc formats with the `builtin` engine. With an explicit engine, the failure is reported.
- A check that finds changes prints ``Format check failed. Run `birdcc fmt <file> --write` to fix.`` to stderr and exits with status 1. `--write` replaces the file through a temporary file and a rename, and leaves an unchanged file untouched.

### `birdcc init [root]`

| Option                 | Default            | Description                                                                            |
| ---------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| `--config-name <name>` | `bird.config.json` | File name to write.                                                                    |
| `--dry-run`            | off                | Print the candidates, the conclusion, and the config that would be written.            |
| `--write`              | off                | Write the config file.                                                                 |
| `--force`              | off                | Overwrite an existing config file.                                                     |
| `--json`               | off                | Print the detection result as JSON. Writes only with `--write`.                        |
| `--max-depth <n>`      | 8                  | Directory depth to scan.                                                               |
| `--max-files <n>`      | 20000              | Number of files to scan.                                                               |
| `--ignore <patterns>`  | none               | Comma-separated directory names to skip, matched exactly, in addition to the defaults. |

```bash
birdcc init --dry-run
birdcc init --write
```

- `root` defaults to the current directory. Detection scans `.conf` files and skips hidden directories and `node_modules`, `dist`, `build`, `target`, `vendor`, `.pnpm`, `coverage`, `__tests__`, `test`, `tests`, `fixtures`, `examples`, `example`, and `docs`.
- One entry produces `"main": "./<path>"`. Several independent entries produce `"workspaces": ["<dir>/", ...]`. The file always contains `$schema`. It contains `formatter.indentSize` when sampling up to 5 entry files identifies 2, 4, or 8 spaces with a confidence of at least 60 percent.
- birdcc writes the file when `--write` is given or when stdout is not a terminal (CI jobs, pipes, redirects). In a terminal without `--write`, it prints the detection result followed by `Run with --write to create bird.config.json`.
- When the target file already exists and sets `main` or `workspaces`, `init` prints a notice and exits with status 0 without detecting, unless `--force` is given. This check also applies to `--dry-run` and `--json`.

### `birdcc lsp --stdio`

Starts the [`@birdcc/lsp`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp) language server on stdin and stdout. `--stdio` is required: without it the command prints ``Only `birdcc lsp --stdio` is currently supported`` and exits with status 1. The language server README lists capabilities, settings, and editor configuration.

## Exit codes

| Command | Status 0                                                                         | Status 1                                                                                                                                         |
| ------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lint`  | No diagnostic has severity `error`.                                              | A diagnostic has severity `error`, or the command failed: no target, unreadable file, invalid config, invalid option value, size limit exceeded. |
| `fmt`   | `--write` completed, or the check found nothing to change.                       | The check found changes, or the command failed.                                                                                                  |
| `init`  | The config was written or printed, or an existing config with an entry was kept. | Without `--dry-run` or `--json`: no entry was detected, no entry could be selected safely, or the file exists and `--force` is missing.          |
| `lsp`   | The client sent `shutdown` before `exit` or before closing stdin.                | `--stdio` is missing, or the client sent `exit` or closed stdin without `shutdown`.                                                              |

An unknown option exits with status 1 and prints a `CACError` stack trace. An unknown command name prints nothing and exits with status 0; run `birdcc --help` for the command list.

## JSON output

### `lint --format json`

| Field         | Type   | Description                                                                                                                                                                                     |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnostics` | array  | Diagnostics, fields below.                                                                                                                                                                      |
| `files`       | number | Number of target files.                                                                                                                                                                         |
| `rules`       | number | Number of keys in `linter.rules`.                                                                                                                                                               |
| `errors`      | number | Diagnostics with severity `error`.                                                                                                                                                              |
| `warnings`    | number | Diagnostics with severity `warning`. `info` diagnostics are not counted.                                                                                                                        |
| `elapsedMs`   | number | Run time in milliseconds.                                                                                                                                                                       |
| `debug`       | object | With `--debug-json`: `configPath`, `targetFiles`, `includeMaxDepth` and `includeMaxFiles` from the command line, and `validateCommand` from the option or the config. Unset values are omitted. |

| Diagnostic field              | Type   | Description                                                                                                                                                                             |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                        | string | Rule code such as `sym/filter-required`, or `bird/parse-error` and `bird/runner-error` from BIRD validation.                                                                            |
| `message`                     | string | Diagnostic text.                                                                                                                                                                        |
| `severity`                    | string | `error`, `warning`, or `info`.                                                                                                                                                          |
| `source`                      | string | `parser`, `core`, `linter`, or `bird`.                                                                                                                                                  |
| `range`                       | object | `line`, `column`, `endLine`, `endColumn`, all 1-based.                                                                                                                                  |
| `uri`                         | string | `file://` URI of the file. Absent on BIRD validation diagnostics.                                                                                                                       |
| `url`                         | string | Built from the rule code: `https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/rules/<code>.md`. The repository has no `docs/rules/` pages, so the link does not resolve. |
| `help`                        | string | Same text as `message`.                                                                                                                                                                 |
| `causes`, `related`, `labels` | array  | Always empty.                                                                                                                                                                           |

```json
{
  "diagnostics": [
    {
      "code": "sym/filter-required",
      "message": "Protocol 'upstream' references unknown filter 'peer_in'",
      "severity": "error",
      "source": "linter",
      "range": { "line": 10, "column": 19, "endLine": 10, "endColumn": 26 },
      "uri": "file:///srv/bird/bird.conf",
      "causes": [],
      "related": [],
      "labels": [],
      "url": "https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/rules/sym/filter-required.md",
      "help": "Protocol 'upstream' references unknown filter 'peer_in'"
    }
  ],
  "files": 1,
  "rules": 4,
  "errors": 1,
  "warnings": 0,
  "elapsedMs": 48
}
```

### `fmt --json`

```json
{
  "changed": true,
  "filePath": "/srv/bird/bird.conf"
}
```

`--debug-json` adds `elapsedMs`, `engine` (`"default"` when neither `--engine` nor `formatter.engine` is set), and `indentSize` and `lineWidth` when the config sets them.

### `init --json`

The detection result:

| Field        | Type           | Description                                                                                                                                                     |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | string         | `single`, `single-ambiguous`, `monorepo-multi-entry`, `monorepo-multi-role`, or `not-found`.                                                                    |
| `confidence` | number         | 0 to 100.                                                                                                                                                       |
| `primary`    | object or null | Highest-ranked candidate.                                                                                                                                       |
| `candidates` | array          | Each candidate has `path`, `score`, `signals` (`name`, `delta`), `role`, `visitedCount`, `missingIncludes`, `qualified`, `declarationKinds`, `includedByCount`. |
| `warnings`   | array          | Each warning has `code`, `message`, and an optional `path`.                                                                                                     |

When an existing config is kept, the output is a single line: `{"skipped":true,"reason":"Config already exists with entry configuration","configPath":"<path>"}`.

## Project configuration

birdcc reads `bird.config.json`, or its alias `birdcc.config.json`, from the directory of the target file or the nearest parent directory that has one; the search continues to the filesystem root. When both names exist in one directory, `bird.config.json` wins.

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "includePaths": ["./filters"],
  "linter": { "rules": { "bgp/*": "warning" } },
  "formatter": { "indentSize": 4 }
}
```

| Key                                                 | Used by                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `main`, `workspaces`                                | `lint` and `fmt` without a file argument; `fmt` rejects `workspaces`. |
| `includePaths`                                      | `lint` include resolution, relative to the config file.               |
| `crossFile.*`                                       | `lint`: `enabled`, include graph limits, and `externalIncludes`.      |
| `linter.enabled`, `linter.withBird`, `linter.rules` | `lint`.                                                               |
| `bird.validateCommand`, `bird.binaryPath`           | `lint --bird`.                                                        |
| `formatter.*`                                       | `fmt`.                                                                |

`linter.rules` maps a rule code or a `<group>/*` pattern to `error`, `warning`, `info`, or `off`. An exact code wins over a pattern, and the longest matching pattern wins over shorter ones. Unknown keys inside `crossFile`, `formatter`, `linter`, and `bird` are errors: the command exits with status 1 and prints `Invalid BIRD project config at <path>: <key>: <message>`.

The full reference is [docs/spec.md](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md); the JSON Schema is at `https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json`.

## Use in CI

Rule diagnostics default to `warning` and `info`. `birdcc lint` exits with status 1 when a diagnostic has severity `error` and with status 0 when all diagnostics are `warning` or `info`; command failures are listed in [Exit codes](#exit-codes). To fail a job on rule violations, raise the rule groups to `error`:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
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
npx @birdcc/cli lint
npx @birdcc/cli fmt --check
```

With this configuration, a reference to an undefined filter prints the following line and the job fails with status 1:

```text
ERROR sym/filter-required [file:///srv/bird/bird.conf] 10:19 Protocol 'upstream' references unknown filter 'peer_in'
```

`birdcc lint --format json > birdcc-lint.json` writes the report in the format described in [JSON output](#json-output). The [setup-birdcc](https://github.com/bird-chinese-community/setup-birdcc) GitHub Action prepares a runner with Node.js, pnpm, and optionally BIRD 2 or BIRD 3; pass its `bird-bin` output to `birdcc lint --bird` through `BIRD_BIN`.

## API

The package entry exports the functions behind the commands. They do not read `bird.config.json`; pass settings as options.

```bash
npm install @birdcc/cli
```

```ts
import { runFmt, runLint } from "@birdcc/cli";

const { diagnostics } = await runLint("bird.conf", {
  severityOverrides: { "sym/*": "error" },
});
for (const diagnostic of diagnostics) {
  console.log(
    diagnostic.severity,
    diagnostic.code,
    diagnostic.range.line,
    diagnostic.message,
  );
}

const { changed } = await runFmt("bird.conf", { indentSize: 4 });
console.log(changed ? "needs formatting" : "already formatted");
```

| Export                 | Kind     | Description                                                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `runLint`              | function | `(filePath, options?) => Promise<BirdccLintOutput>`. Lints a file and optionally runs BIRD validation. |
| `runFmt`               | function | `(filePath, options?) => Promise<FmtResult>`. Formats a file; writes it when `write` is `true`.        |
| `formatBirdConfigText` | function | `(text, options?) => Promise<FmtResult>`. Formats a string with the `builtin` engine.                  |
| `runBirdValidation`    | function | `(filePath, validateCommand?) => BirdValidateResult`. Runs the validation command synchronously.       |
| `parseBirdStderr`      | function | `(stderr) => BirdDiagnostic[]`. Converts `bird -p` stderr into diagnostics.                            |
| `runLspStdio`          | function | `() => Promise<void>`. Starts the language server on stdio.                                            |
| `LintOptions`          | type     | Options of `runLint`.                                                                                  |
| `BirdccLintOutput`     | type     | `{ diagnostics: BirdDiagnostic[] }`.                                                                   |
| `FmtOptions`           | type     | Options of `runFmt`.                                                                                   |
| `FmtResult`            | type     | `{ changed: boolean; formattedText: string }`.                                                         |
| `BirdValidateResult`   | type     | `{ command, exitCode, stderr, stdout, diagnostics }`.                                                  |

```ts
interface LintOptions {
  linterEnabled?: boolean; // false skips static analysis
  withBird?: boolean; // run the BIRD validation command
  crossFile?: boolean; // default true
  includeMaxDepth?: number; // default 16
  includeMaxFiles?: number; // default 256
  includeMaxDocumentBytes?: number; // default 2 MiB
  includeMaxTotalBytes?: number; // default 16 MiB
  includePaths?: string[]; // resolved against the current directory
  allowIncludeOutsideWorkspace?: boolean;
  validateCommand?: string;
  severityOverrides?: Record<string, "error" | "warning" | "info" | "off">;
}

interface FmtOptions {
  write?: boolean;
  engine?: "dprint" | "builtin";
  indentSize?: number;
  useTabs?: boolean;
  lineWidth?: number;
  safeMode?: boolean;
}
```

Two subpath exports describe the JSON output:

- `@birdcc/cli/output-types`: TypeScript types only (`BirdLintJsonOutput`, `BirdLintDiagnostic`, `BirdFmtJsonOutput`, `BirdInitJsonOutput`, and related types).
- `@birdcc/cli/output-schemas`: zod 4 schemas `BirdLintJsonOutputSchema`, `BirdLintDiagnosticSchema`, `BirdLintDiagnosticWithExtrasSchema`, `BirdFmtJsonOutputSchema`, `BirdInitJsonOutputSchema`, and `InitCandidateJsonSchema`. `BirdInitJsonOutputSchema` validates the detection result, not the `skipped` object.

```ts
import { readFile } from "node:fs/promises";
import { BirdLintJsonOutputSchema } from "@birdcc/cli/output-schemas";

const report = BirdLintJsonOutputSchema.parse(
  JSON.parse(await readFile("birdcc-lint.json", "utf8")),
);
console.log(`${report.errors} errors, ${report.warnings} warnings`);
```

## See also

- [@birdcc/lsp](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp): the language server behind `birdcc lsp`.
- [@birdcc/linter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter): rule list.
- [@birdcc/formatter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/formatter): formatting engines and options.
- [Project configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md)
- [Architecture: CLI lint pipeline](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#cli-lint-pipeline)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
