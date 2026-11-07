<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/core/assets/icon-256.png" width="96" height="96" alt="@birdcc/core" />

# @birdcc/core

Semantic analysis for BIRD 2 and BIRD 3 configuration files.

[![npm](https://img.shields.io/npm/v/@birdcc/core?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@birdcc/core)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

`@birdcc/core` turns a document parsed by [@birdcc/parser](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/parser) into a snapshot: a symbol table, semantic diagnostics, and type-check diagnostics. It follows `include` statements across files within depth, file-count, and byte budgets, and merges the per-file symbol tables. It also loads `bird.config.json` and detects project entry files. [@birdcc/linter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter), [@birdcc/lsp](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp), [@birdcc/cli](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli), and the BIRD2 LSP extension use it.

## Installation

```bash
npm install @birdcc/core
```

Requires Node.js 22 or newer.

## Usage

Analyze one document:

```ts
import { buildCoreSnapshot } from "@birdcc/core";

const snapshot = await buildCoreSnapshot(`
template bgp peers { local as 65001; }
protocol bgp upstream from peers { neighbor 192.0.2.2 as 65002; }
protocol bgp upstream from missing_template { neighbor 192.0.2.3 as 65003; }
`);

console.log(snapshot.symbols.map((symbol) => `${symbol.kind} ${symbol.name}`));
for (const diagnostic of snapshot.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.message);
}
```

Output:

```text
[ 'template peers', 'protocol upstream', 'protocol upstream' ]
error semantic/duplicate-definition protocol 'upstream' is already defined
error semantic/undefined-reference Undefined template reference 'missing_template'
```

Resolve an include graph. This example passes the documents in memory; without `loadFromFileSystem: false`, the resolver reads missing files from disk.

```ts
import { resolveCrossFileReferences } from "@birdcc/core";

const result = await resolveCrossFileReferences({
  entryUri: "file:///etc/bird/bird.conf",
  loadFromFileSystem: false,
  documents: [
    {
      uri: "file:///etc/bird/bird.conf",
      text: 'router id 192.0.2.1;\ninclude "peers.conf";\ninclude "missing.conf";\n',
    },
    {
      uri: "file:///etc/bird/peers.conf",
      text: "protocol bgp upstream { local as 65001; neighbor 192.0.2.2 as 65002; }\n",
    },
  ],
});

console.log(result.visitedUris);
console.log(
  result.symbolTable.definitions.map(
    (symbol) => `${symbol.kind} ${symbol.name} ${symbol.uri}`,
  ),
);
for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.severity, diagnostic.code, diagnostic.message);
}
```

Output:

```text
[ 'file:///etc/bird/bird.conf', 'file:///etc/bird/peers.conf' ]
[ 'protocol upstream file:///etc/bird/peers.conf' ]
warning semantic/missing-include Included file not found in workspace: 'missing.conf'
```

## Diagnostics

| Code                                | Severity | Reported for                                                                                                                                                                                                  |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic/duplicate-definition`     | error    | A second definition with the same kind and name (names are case-sensitive)                                                                                                                                    |
| `semantic/undefined-reference`      | error    | `from <template>` that names no defined template                                                                                                                                                              |
| `semantic/circular-template`        | error    | A template inheritance cycle                                                                                                                                                                                  |
| `semantic/missing-include`          | warning  | An include that is missing, outside the workspace root, over a budget, or not expandable                                                                                                                      |
| `semantic/invalid-router-id`        | error    | A `router id` that is not an IPv4 address, an integer, `from routing`, `from dynamic`, or a `define` resolving to one of these                                                                                |
| `semantic/invalid-neighbor-address` | error    | A `neighbor` address that is not an IP address                                                                                                                                                                |
| `semantic/invalid-cidr`             | error    | An invalid prefix literal in a filter or function                                                                                                                                                             |
| `type/mismatch`                     | error    | A typed local variable declared or assigned with a value of another type                                                                                                                                      |
| `type/undefined-variable`           | error    | An assignment to a name not declared earlier in the same body, other than `gw`, `ifname`, `onlink`, `dest`, `krt_prefsrc`, `bgp_local_pref`, `bgp_next_hop`, `bgp_next_hop_ll`, `preference`, and `validated` |
| `type/unknown-expression`           | warning  | A `return` expression whose type cannot be inferred; only with `typeCheck.strictUnknownExpression`                                                                                                            |

Every diagnostic has `source: "core"`. [@birdcc/linter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter#rules) maps these codes to its rule codes (for example `semantic/duplicate-definition` to `sym/duplicate`). `parseBirdValidationOutput` produces a separate code, `bird-validation` with `source: "bird"`, from `bird -p` output.

Type checks run in filter and function bodies. They infer `int`, `bool`, `string`, `ip`, and `prefix` values from literals and from variables declared earlier in the same body.

## Cross-file resolution

`resolveCrossFileReferences(options)` starts at `entryUri` and visits included files breadth-first:

- An include path resolves against the including file first, then against each `includeSearchPaths` entry.
- `*` in the file-name part of an include path expands to the matching files in that directory, in sorted order.
- Files outside `workspaceRootUri` (default: the directory of the entry file) are skipped unless `allowIncludeOutsideWorkspace` is `true`. The check also applies to symbolic-link targets.
- A file that is already visited or queued is not loaded again, so include cycles end without a diagnostic.
- Each visited file gets its own snapshot in `snapshots`. The merged `symbolTable` and `diagnostics` cover the whole graph, so duplicate definitions and template references are checked across files.
- An unreadable entry file does not throw: the result has no visited files and reports the failure as `semantic/missing-include`.

| Option                         | Default                                | Description                                                                  |
| ------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------- |
| `entryUri`                     | required                               | `file://` URI or absolute path of the entry file                             |
| `documents`                    | `[]`                                   | `{ uri, text }[]` used instead of the file contents, such as unsaved buffers |
| `loadFromFileSystem`           | `true`                                 | Read files that are not in `documents` from disk                             |
| `readFileText`                 | none                                   | `(uri) => Promise<string>` replacement for disk reads                        |
| `includeSearchPaths`           | `[]`                                   | Extra directories for include lookup                                         |
| `workspaceRootUri`             | directory of `entryUri`                | Root that include targets must stay inside                                   |
| `allowIncludeOutsideWorkspace` | `false`                                | Allow include targets outside the workspace root                             |
| `maxDepth`                     | `16` (`DEFAULT_CROSS_FILE_MAX_DEPTH`)  | Maximum include nesting depth                                                |
| `maxFiles`                     | `256` (`DEFAULT_CROSS_FILE_MAX_FILES`) | Maximum number of files in the graph                                         |
| `maxDocumentBytes`             | 2 MiB (`DEFAULT_MAX_DOCUMENT_BYTES`)   | Maximum UTF-8 size of one file                                               |
| `maxTotalBytes`                | 16 MiB (`DEFAULT_MAX_TOTAL_BYTES`)     | Maximum UTF-8 size of all files together                                     |
| `typeCheck`                    | none                                   | `TypeCheckOptions` passed to `checkTypes` for every file                     |

An include that would exceed `maxDepth`, `maxFiles`, or a byte budget is skipped and reported as `semantic/missing-include`; `stats` counts the skipped files. Two further limits are fixed: wildcard expansion reads at most 20,000 directory entries per `resolveCrossFileReferences` call, and a process-wide parse cache keeps at most 512 documents and 16 MiB of source text. `maxDepth` must be a safe integer of 0 or more, and the other three budgets 1 or more; other values throw.

The budgets in `bird.config.json` (`crossFile.maxDepth`, `crossFile.maxFiles`, `crossFile.maxDocumentBytes`, `crossFile.maxTotalBytes`) feed these options in the CLI and the language server. See [Analysis budgets](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/analysis-budgets.md).

## Project configuration

`loadBirdProjectConfigForFile(path)` looks for `bird.config.json` (or its alias `birdcc.config.json`) in the directory of `path` and each parent directory, and validates the first file it finds. It returns `{ config: {} }` when no file exists and throws `Invalid BIRD project config at <path>: ...` when the JSON or a field is invalid. The field reference is [docs/spec.md](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md).

`applyLintConfiguration(diagnostics, config.linter)` applies `linter.rules` severity overrides and `linter.enabled`. See [Configuring severity](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter#configuring-severity).

## API

Snapshots and symbols:

| Export                        | Kind     | Description                                                                                                          |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `buildCoreSnapshot`           | function | `(text: string) => Promise<CoreSnapshot>`; parses `text`, then builds the snapshot                                   |
| `buildCoreSnapshotFromParsed` | function | `(parsed: ParsedBirdDocument, options?: { uri?: string; typeCheck?: TypeCheckOptions }) => CoreSnapshot`             |
| `buildSymbolTableFromParsed`  | function | `(parsed, options?: { uri?: string }) => SymbolTable`                                                                |
| `mergeSymbolTables`           | function | `(tables: SymbolTable[]) => SymbolTable`                                                                             |
| `pushSymbolTableDiagnostics`  | function | `(table: SymbolTable, diagnostics: BirdDiagnostic[]) => void`; appends duplicate and undefined-reference diagnostics |
| `checkTypes`                  | function | `(program: BirdProgram, symbolTable: SymbolTable, options?: TypeCheckOptions) => BirdDiagnostic[]`                   |
| `collectFunctionReturnHints`  | function | `(source: string) => Promise<readonly FunctionReturnHint[]>`; declared and inferred return types of each function    |
| `DEFAULT_DOCUMENT_URI`        | constant | `"memory://bird.conf"`, the URI used when none is given                                                              |

Cross-file resolution:

| Export                         | Kind     | Description                                                                                                                              |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveCrossFileReferences`   | function | `(options: CrossFileResolveOptions) => Promise<CrossFileResolutionResult>`                                                               |
| `readBirdConfigFile`           | function | `(uri: string, maxBytes: number) => Promise<string>`; reads a regular file without following a symbolic link at the final path component |
| `DEFAULT_CROSS_FILE_MAX_DEPTH` | constant | `16`                                                                                                                                     |
| `DEFAULT_CROSS_FILE_MAX_FILES` | constant | `256`                                                                                                                                    |
| `DEFAULT_MAX_DOCUMENT_BYTES`   | constant | `2097152` (2 MiB)                                                                                                                        |
| `DEFAULT_MAX_TOTAL_BYTES`      | constant | `16777216` (16 MiB)                                                                                                                      |

Project configuration and `bird -p`:

| Export                         | Kind     | Description                                                                                                          |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `loadBirdProjectConfigForFile` | function | `(targetFilePath: string) => Promise<LoadedBirdProjectConfig>`                                                       |
| `birdProjectConfigSchema`      | constant | zod schema of `bird.config.json`                                                                                     |
| `birdEditorSettingsSchema`     | constant | zod schema of the editor settings object                                                                             |
| `applyLintConfiguration`       | function | `(diagnostics, linterConfig) => BirdDiagnostic[]`; pass `config.linter`, which may be `undefined`                    |
| `resolveSeverityOverride`      | function | `(code, rules?) => "error" \| "warning" \| "info" \| "off" \| undefined`                                             |
| `resolveAnalysisBudget`        | function | `(crossFile?, resourceMaxFileSizeBytes?) => { maxDocumentBytes, maxTotalBytes }`                                     |
| `parseBirdValidationOutput`    | function | `(output: string, filePath: string) => BirdDiagnostic[]`; reads `file:line:col` and `Parse error ..., line N:` lines |

Entry detection:

| Export                                  | Kind     | Description                                                                                                                                                         |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sniffProjectEntrypoints`               | function | `(root: string, opts?: DetectionOptions) => Promise<DetectionResult>`; ranks entry candidates by file name, path, parsed declarations, and include graph            |
| `selectAutoDetectedEntry`               | function | `(result: DetectionResult) => EntryCandidate \| null`; returns the primary candidate for a `single` result with confidence 70 or more, or for `monorepo-multi-role` |
| `evaluateBirdDocumentEligibility`       | function | `(text, options?) => Promise<BirdDocumentEligibility>`; eligible when the file is the explicit `main`, has a canonical name, or contains parsed BIRD declarations   |
| `evaluateParsedBirdDocumentEligibility` | function | Same check for an already parsed document                                                                                                                           |
| `collectBirdDeclarationEvidence`        | function | `(parsed) => BirdDeclarationEvidence[]`                                                                                                                             |
| `isCanonicalBirdConfigPath`             | function | `true` for `bird.conf`, `bird2.conf`, `bird3.conf`, `bird6.conf`, and their dot-prefixed forms                                                                      |
| `isForbiddenRoot`                       | function | `true` for a path with fewer than two segments, such as `/` or `/Users`; detection refuses to scan it                                                               |

`DetectionOptions` defaults: `maxDepth` 8, `maxFiles` 20,000, `maxEntries` 20,000, `maxDirectories` 2,048, `maxCandidates` 100, `followSymlinks` `false`.

Main types:

```ts
interface BirdDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  source: "parser" | "core" | "linter" | "bird";
  range: { line: number; column: number; endLine: number; endColumn: number };
  uri?: string;
}

interface CoreSnapshot {
  symbols: SymbolDefinition[]; // define, protocol, template, filter, function, table
  references: SymbolReference[]; // template references from "from <name>"
  symbolTable: SymbolTable;
  typeDiagnostics: BirdDiagnostic[];
  diagnostics: BirdDiagnostic[]; // semantic and type diagnostics
}

interface CrossFileResolutionResult {
  entryUri: string;
  visitedUris: string[];
  symbolTable: SymbolTable;
  snapshots: Record<string, CoreSnapshot>;
  documents: Record<string, string>;
  parsedDocuments: Record<string, ParsedBirdDocument>;
  diagnostics: BirdDiagnostic[];
  stats: CrossFileResolutionStats;
}
```

Other exported types:

- Diagnostics and symbols: `BirdDiagnosticSeverity`, `BirdRange`, `BirdSymbolKind`, `SymbolDefinition`, `SymbolReference`, `SymbolTable`, `TypeCheckOptions`, `TypeValue`.
- Cross-file resolution: `CrossFileDocumentInput`, `CrossFileResolveOptions`, `CrossFileResolutionStats`, `ResolveCrossFileReferences`.
- Function return hints: `BirdHintType`, `FunctionReturnDetail`, `FunctionReturnHint`.
- Project configuration: `BirdProjectConfig`, `BirdEditorSettings`, `LintRuleSeverity`, `LoadedBirdProjectConfig`.
- Entry detection: `BirdDeclarationEvidence`, `BirdDocumentEligibility`, `BirdDocumentEligibilityOptions`, `BirdDocumentEligibilityReason`, `ContentSignals`, `DetectionKind`, `DetectionOptions`, `DetectionResult`, `DetectionWarning`, `EntryCandidate`, `FileRole`, `IncludeGraphExtras`, `SignalRecord`.

## See also

- [@birdcc/linter](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/linter): rule checks on top of a core snapshot.
- [Project configuration reference](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md)
- [Architecture: core](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#core)

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
