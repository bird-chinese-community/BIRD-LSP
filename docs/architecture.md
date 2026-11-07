# Architecture

This document describes how the packages in this repository process a BIRD configuration. The package dependency graph is in the [README](../README.md#architecture). Function and file names refer to the sources under `packages/@birdcc/`, and workflow file names to `.github/workflows/`.

## Parser

`parseBirdConfig` in `@birdcc/parser` turns source text into a `ParsedBirdDocument`. It loads the committed grammar `tree-sitter-birdcc.wasm` through web-tree-sitter once per process and caches the parser. Each call parses the text into a Tree-sitter tree, collects parse issues, and maps the tree to typed declarations. When the runtime cannot load, the call returns an empty program with one `parser/runtime-error` issue instead of throwing.

Arrows show the order of calls and the flow of data.

```mermaid
flowchart TD
  INPUT["Source text"] --> PBC["parseBirdConfig()"]
  PBC --> GP["getParser()<br/>cached web-tree-sitter Parser"]
  WASM["tree-sitter-birdcc.wasm<br/>dist/, then src/"] --> GP
  GP -->|"load failure"| RT["Empty program<br/>parser/runtime-error"]
  GP --> TREE["parser.parse(input)<br/>Tree-sitter tree"]
  TREE --> ISS["collectTreeIssues()<br/>ensureBraceBalanceIssue()"]
  TREE --> DECL["parseDeclarations()<br/>14 declaration kinds"]
  ISS --> SUP["suppressRecoverableSyntaxIssues()<br/>dedupeIssues()"]
  DECL -->|"declaration issues"| SUP
  TREE -->|"includeSyntaxLayout: true"| LAY["collectBirdSyntaxLayout()"]
  DECL --> DOC["ParsedBirdDocument"]
  SUP --> DOC
  LAY --> DOC
```

## Core

### Snapshot

`buildCoreSnapshotFromParsed` in `@birdcc/core` analyzes one parsed document. It builds a symbol table of `define`, `protocol`, `template`, `filter`, `function`, and `table` declarations, collects semantic diagnostics (router id, neighbor address, prefix literals), template inheritance cycles, duplicate definitions, and undefined template references, and runs the type checker over filter and function bodies. `buildCoreSnapshot` is the async wrapper that parses the text first.

Arrows show the order of calls and the flow of data.

```mermaid
flowchart TD
  TEXT["Source text"] --> BCS["buildCoreSnapshot()"]
  BCS --> PARSE["parseBirdConfig()<br/>@birdcc/parser"]
  PARSE --> FROM["buildCoreSnapshotFromParsed()"]
  FROM --> ST["buildSymbolTableFromParsed()"]
  FROM --> SEM["collectSemanticDiagnostics()<br/>router id, neighbor, prefix literals"]
  FROM --> CYC["collectCircularTemplateDiagnostics()"]
  ST --> PUSH["pushSymbolTableDiagnostics()<br/>duplicates, undefined templates"]
  FROM --> TYP["checkTypes()<br/>filter and function bodies"]
  ST --> SNAP["CoreSnapshot"]
  SEM --> SNAP
  CYC --> SNAP
  PUSH --> SNAP
  TYP --> SNAP
```

### Cross-file resolution

`resolveCrossFileReferences` follows `include` statements from an entry file breadth-first. Every file passes a workspace-root check and byte budgets before it is parsed (2 MiB per file, 16 MiB for the graph), and the queue stops at depth 16 and 256 files by default. Parsed documents come from a process-wide cache of 512 documents and 16 MiB. After the queue is empty, the per-file symbol tables are merged, so duplicate definitions and template references are checked across files. A file that is already visited or queued is skipped, which ends include cycles without a diagnostic. [analysis-budgets.md](./analysis-budgets.md) lists the byte budgets and cache limits and the project settings that change them.

Arrows show the order of calls and the flow of data. The dotted arrow is the failure path.

```mermaid
flowchart TD
  OPTS["CrossFileResolveOptions<br/>entryUri, documents, budgets"] --> RCF["resolveCrossFileReferences()"]
  RCF --> ENSURE["ensureDocument()<br/>workspace root, 2 MiB per file, 16 MiB total"]
  ENSURE --> QUEUE["Breadth-first queue<br/>depth 16, 256 files"]
  QUEUE --> PARSE["parseDocumentWithCache()<br/>512 documents, 16 MiB"]
  PARSE --> SNAP["buildCoreSnapshotFromParsed()<br/>one snapshot per file"]
  SNAP --> CAND["resolveIncludeCandidateUris()<br/>including file, then includeSearchPaths"]
  CAND --> WILD["expandWildcardIncludeUri()<br/>20,000 directory entries"]
  WILD -->|"not visited or queued"| ENSURE
  ENSURE -.->|"unreadable, outside root, over budget"| MISS["semantic/missing-include"]
  QUEUE -->|"queue empty"| MERGE["mergeSymbolTables()<br/>pushSymbolTableDiagnostics()"]
  MERGE --> TCYC["collectCircularTemplateDiagnostics()<br/>all files"]
  TCYC --> RESULT["CrossFileResolutionResult"]
  MISS --> RESULT
```

## Linter

`lintBirdConfig` in `@birdcc/linter` reuses a parsed document and core snapshot when the caller passes them, and otherwise creates both. It maps parser and core diagnostics to rule codes with default severities, runs the rule functions of six groups, drops diagnostics that a fragment or library file cannot resolve on its own, and removes duplicates. Default severities are `warning` for `sym`, `cfg`, `net`, and `type` rules and `info` for `bgp` and `ospf` rules. The language server then applies `linter.rules` from `bird.config.json` with `applyLintConfiguration` from `@birdcc/core`, and the CLI with its own `applySeverityOverrides`. Both resolve each code with `resolveSeverityOverride` from `@birdcc/core`: an exact rule code wins, then the longest matching `prefix/*` key, and `off` removes the diagnostic.

Arrows show the order of calls and the flow of data.

```mermaid
flowchart TD
  IN["Text, optional parsed document and snapshot"] --> LBC["lintBirdConfig()"]
  LBC --> P["parseBirdConfig()<br/>when parsed is not passed"]
  P --> C["buildCoreSnapshotFromParsed()<br/>when core is not passed"]
  LBC --> ROLE["inferLintDocumentRole()<br/>entry, fragment, library, unknown"]
  C --> NORM["normalizeBaseDiagnostics()<br/>rule codes and RULE_SEVERITY"]
  C --> RULES["Rule functions<br/>rules/sym.ts, cfg.ts, net.ts, type.ts, bgp.ts, ospf.ts"]
  NORM --> FILTER["filterRoleDiagnostics()"]
  RULES --> FILTER
  ROLE --> FILTER
  FILTER --> DEDUPE["dedupeDiagnostics()"]
  DEDUPE --> RES["LintResult"]
  RES --> APPLY["LSP: applyLintConfiguration()<br/>CLI: applySeverityOverrides()<br/>both call resolveSeverityOverride()"]
  CONF["linter.rules in bird.config.json"] --> APPLY
  APPLY --> OUT["Diagnostics shown by CLI and LSP"]
```

## Formatter

### Engines

`formatBirdConfig` in `@birdcc/formatter` fills in defaults (`dprint`, indent 2, width 80, spaces, safe mode on) and runs the selected engine. The `dprint` engine hosts the WebAssembly plugin from `@birdcc/dprint-plugin-bird` in a `@dprint/formatter` context, cached per option set (up to 16 contexts). When it throws and the caller did not pass `engine`, the text is formatted again with the `builtin` engine; when the caller passed `engine: "dprint"`, the error propagates. Both engines use the same line-based algorithm: indentation from bracket tokens in the Tree-sitter tree, blank-line collapsing, and no line wrapping.

Arrows show the order of calls and the flow of data.

```mermaid
flowchart TD
  CALL["formatBirdConfig(text, options)"] --> RES["resolveOptions()"]
  RES --> ENG{"resolved engine"}
  ENG -->|"dprint"| DP["formatWithEmbeddedDprint()"]
  ENG -->|"builtin"| BI["formatWithBuiltin()"]
  DP --> CTX["getOrCreateDprintContext()<br/>@dprint/formatter, up to 16 contexts"]
  WASM["dprint-plugin-bird.wasm<br/>getBuffer()"] --> CTX
  DP -->|"success"| OUTD["BirdFormatResult<br/>engine: dprint"]
  DP -->|"error, engine not passed"| BI
  DP -->|"error, engine: dprint passed"| ERR["Error: Formatting with 'dprint' failed"]
  BI --> OUTB["BirdFormatResult<br/>engine: builtin"]
```

### Safe mode

With `safeMode` on, changed output must parse to the same result as the input. Both engines compare a semantic fingerprint built from `@birdcc/parser` output: the declaration tree without source ranges and with whitespace in text collapsed, plus the code and message of each parse issue. The `dprint` engine adds a check inside the Rust plugin that compares Tree-sitter node kinds, child counts, missing-node flags, and token text. A file with syntax errors is formatted when its parse issues stay the same.

Arrows show the order of calls and the flow of data.

```mermaid
flowchart TD
  subgraph DPRINT ["dprint engine"]
    D1["format_text()<br/>Rust plugin"] --> D2["normalize_text_with_builtin()<br/>syntax::parse(), syntax::layout()"]
    D2 --> D3["syntax::ensure_equivalent()<br/>node kinds, child counts, tokens"]
  end
  subgraph BUILTIN ["builtin engine"]
    B1["parseBirdConfig()<br/>includeSyntaxLayout: true"] --> B2["createSemanticFingerprintFromParsed()<br/>collectParserProtectedLinesFromParsed()"]
    B2 --> B3["normalizeTextWithBuiltin()"]
  end
  D3 --> CHECK["assertSafeModeSemanticEquivalence()"]
  B3 --> CHECK
  CHECK --> FP["createSemanticFingerprint(output)<br/>declarations without ranges, parse issues"]
  FP -->|"equal"| OK["Formatted text"]
  FP -->|"different"| REJ["Error: semantic fingerprint changed"]
```

## dprint plugin build and distribution

`build.rs` in `@birdcc/dprint-plugin-bird` runs the pinned `tree-sitter-cli` on `packages/@birdcc/parser/grammar.js`, writes `parser.c` to Cargo's `OUT_DIR`, and compiles it with the `cc` crate, so the WebAssembly module embeds the same grammar as `@birdcc/parser`. `scripts/build-wasm.mjs` builds the crate for `wasm32-unknown-unknown` with the `wasm` feature and copies the module to `dist/dprint-plugin-bird.wasm`; `dist/index.js` exposes it through `getPath()` and `getBuffer()`, and the release workflow publishes the package to npm with Tegami. `@birdcc/formatter` passes `getBuffer()` to `addPlugin()` on a `@dprint/formatter` context for its default `dprint` engine, and the dprint CLI loads the same file through a path or an `npm:` specifier.

Arrows follow the build and data flow, from sources to consumers.

```mermaid
flowchart LR
  subgraph build ["pnpm --filter @birdcc/dprint-plugin-bird build"]
    GRAMMAR["packages/@birdcc/parser/grammar.js"]
    PARSERC["parser.c in OUT_DIR"]
    RUST["src/*.rs<br/>dprint-core, tree-sitter"]
    CARGO["cargo build --release<br/>--target wasm32-unknown-unknown<br/>--features wasm"]
    DISTWASM["dist/dprint-plugin-bird.wasm"]
    INDEXTS["src/index.ts"]
    INDEXJS["dist/index.js<br/>getPath(), getBuffer()"]
  end
  subgraph formatter ["@birdcc/formatter"]
    CTX["dprint-context.ts<br/>getOrCreateDprintContext()"]
    ENGINE["engines.ts<br/>formatWithEmbeddedDprint()"]
  end
  GRAMMAR -->|"build.rs: tree-sitter generate"| PARSERC
  PARSERC -->|"build.rs: cc crate"| CARGO
  RUST --> CARGO
  CARGO -->|"scripts/build-wasm.mjs copies"| DISTWASM
  INDEXTS -->|"tsc"| INDEXJS
  DISTWASM --> NPM["npm package<br/>@birdcc/dprint-plugin-bird"]
  INDEXJS --> NPM
  RELEASE["release.yml<br/>pnpm build, pnpm tegami ci"] -->|"publishes"| NPM
  NPM -->|"getBuffer(), addPlugin()"| CTX
  CTX -->|"context.formatText()"| ENGINE
  NPM -->|"file path or npm: specifier"| CLI["dprint CLI"]
```

## LSP diagnostics pipeline

Every open or change event invalidates the affected entries and schedules validation per document URI; the scheduler waits 120 ms after the last event and drops results that a newer event superseded. Validation resolves the project for the document, checks the size budget and document eligibility, then resolves the include graph from the entry file and lints the whole graph. Diagnostics for the other files of the graph are published during the analysis, and the scheduler publishes the diagnostics of the document itself. When `crossFile.enabled` is `false`, the document is linted on its own with `lintBirdConfig`.

Arrows show messages and calls in time order.

```mermaid
sequenceDiagram
  participant Client as Editor
  participant Docs as TextDocuments
  participant Sched as Validation scheduler
  participant Server as analyzeDocumentSnapshot
  participant Project as resolveProjectForDocument
  participant Core as @birdcc/core
  participant Linter as @birdcc/linter
  Client->>Docs: textDocument/didOpen or didChange
  Docs->>Sched: invalidateAnalysis, schedule(document)
  Sched->>Sched: wait 120 ms, keep the latest ticket
  Sched->>Server: validate(document)
  Server->>Project: resolve entry for the document URI
  Project-->>Server: entryUri, search paths, limits, config
  Server->>Server: size budget and document eligibility
  alt crossFile enabled
    Server->>Core: resolveCrossFileReferences(entryUri, open documents)
    Core-->>Server: documents, symbol table, include diagnostics
    Server->>Linter: lintResolvedCrossFileGraph(crossFile)
    Linter-->>Server: lint results per URI
    Server->>Server: applyLintConfiguration(linter)
    Server->>Client: publishDiagnostics for other files in the graph
  else crossFile.enabled is false
    Server->>Linter: lintBirdConfig(document text)
    Linter-->>Server: lint result
    Server->>Server: applyLintConfiguration(linter)
  end
  Server-->>Sched: diagnostics of the document
  Sched->>Client: textDocument/publishDiagnostics
```

## Project entry resolution

`birdcc` and the language server load the nearest `bird.config.json` or `birdcc.config.json` with the same loader, but pick the entry of the include graph differently. `birdcc lint` takes its targets from the file argument; without one, it uses `workspaces` when the config sets them and `main` otherwise. For a target without an `include` line it runs entry detection in the target's directory and up to four parent directories. The language server takes the entry from `workspaces` or `main` when a config file exists and runs entry detection in the containing workspace folder otherwise. Both append `includePaths`, resolved against the config file's directory, to the include search paths.

Arrows show control flow.

```mermaid
flowchart TD
  FILE["Target file or open document"] --> LOAD["loadBirdProjectConfigForFile<br/>nearest config, bird.config.json first"]
  LOAD --> T
  LOAD --> L1
  subgraph cli ["birdcc lint: cli.ts and runCrossFileLint"]
    T["Targets: file argument, else bird.conf of each<br/>matching workspace, else main or bird.conf"]
    C1{"Target has an include line?"}
    C2["Entry: the target<br/>search path: target directory"]
    C3["sniffProjectEntrypoints<br/>target directory and 4 parents"]
    C4["Entry: detected entry<br/>search paths: project and entry directories"]
    T --> C1
    C1 -->|"yes"| C2
    C1 -->|"no"| C3 --> C4
  end
  subgraph lsp ["Language server: resolveProjectAnalysisOptions"]
    L1{"Config file found?"}
    L2["workspaces: bird.conf of the deepest matching directory<br/>main: the main file<br/>otherwise or missing: the document"]
    L3["sniffProjectEntrypoints<br/>in the containing workspace folder"]
    L4["Search paths: config directory,<br/>or workspace folder and entry directory"]
    L1 -->|"yes"| L2 --> L4
    L1 -->|"no"| L3 --> L4
  end
  C2 --> INC["includePaths appended to the search paths"]
  C4 --> INC
  L4 --> INC
```

## CLI lint pipeline

`birdcc lint` loads the project config, then calls `runLint` for each target. Static analysis runs on the include graph by default and on the single file with `--no-cross-file` or `crossFile.enabled: false`. With `--bird` or `linter.withBird`, `runBirdValidation` runs the first available validation command template without a shell and converts its stderr into diagnostics. Severity overrides from `linter.rules` apply last, and the command exits with status 1 when any diagnostic has severity `error`.

Arrows show control flow.

```mermaid
flowchart TD
  ARGS["birdcc lint [file]"] --> TARGETS["Resolve targets, load config"]
  TARGETS --> RUN["runLint for each target"]
  RUN --> LE{"linter.enabled is false?"}
  LE -->|"no"| CF{"--cross-file and<br/>crossFile.enabled?"}
  CF -->|"yes"| CROSS["runCrossFileLint<br/>resolveCrossFileReferences<br/>lintResolvedCrossFileGraph"]
  CF -->|"no"| SINGLE["lintBirdConfig"]
  LE -->|"yes"| BQ
  CROSS --> BQ{"--bird or linter.withBird?"}
  SINGLE --> BQ
  BQ -->|"yes"| TPL["Template, first set:<br/>--validate-command, bird.validateCommand,<br/>bird.binaryPath, BIRD_BIN, bird -p -c {file}"]
  TPL --> EXEC["runBirdValidation<br/>spawnSync, 10 s timeout<br/>parseBirdStderr"]
  EXEC --> SEV
  BQ -->|"no"| SEV["applySeverityOverrides<br/>linter.rules"]
  SEV --> OUT["Text or JSON output<br/>exit 1 when a diagnostic is error"]
```

## ASN intelligence data flow

`scripts/build-db.ts` in `@birdcc/intel` downloads `asns/asns.csv` from the `auto-update` branch of BGP.Tools-OpenDB, sorts the rows by ASN, and writes a gzip-compressed four-column MessagePack file to `packages/@birdcc/intel/db/asn-db.bin.gz`. The `intel-asn-update.yml` workflow runs this script every Monday at 04:00 UTC; when the file changed, `tools/intel-release-note.mjs` adds a Tegami patch changeset and the workflow opens a pull request from `feat/weekly-asn-database`, and the merged file ships with the next `@birdcc/intel` release. At startup `startLspServer()` calls `createAsnIntel()`, which validates the file and builds lookup maps; the completion, hover, and inlay hint handlers query it unless `bird2-lsp.intel.enabled` or the setting of that feature (`intel.completion`, `intel.hover`, `intel.inlayHints`) is `false`.

Arrows follow the data from the upstream CSV to the language server features.

```mermaid
flowchart TB
  SRC["BGP.Tools-OpenDB<br/>auto-update: asns/asns.csv"]
  subgraph update ["intel-asn-update.yml, Mondays 04:00 UTC"]
    BUILD["scripts/build-db.ts<br/>pnpm build:db"]
    NOTE["tools/intel-release-note.mjs"]
    PR["pull request from<br/>feat/weekly-asn-database"]
  end
  DB["packages/@birdcc/intel/db/asn-db.bin.gz"]
  CHANGESET[".tegami/weekly-intel-database.md<br/>@birdcc/intel: patch"]
  PKG["@birdcc/intel release<br/>db/ included in the npm package"]
  subgraph lsp ["@birdcc/lsp"]
    LOAD["startLspServer()<br/>createAsnIntel()"]
    COMP["createAsnCompletionItems()"]
    HOVER["createAsnHover()"]
    INLAY["createAsnInlayHints()"]
  end
  SRC -->|"fetch"| BUILD
  BUILD -->|"MessagePack, gzip level 9"| DB
  DB -->|"git diff"| NOTE
  NOTE --> CHANGESET
  DB --> PR
  CHANGESET --> PR
  PR -->|"merge, release.yml"| PKG
  PKG --> LOAD
  LOAD -->|"prefixSearch(), formatDisplay()"| COMP
  LOAD -->|"lookupDisplay()"| HOVER
  LOAD -->|"lookupDisplay()"| INLAY
```

## VS Code extension

### Starting the language server

VS Code activates the extension only in a trusted workspace, because the manifest does not declare `capabilities.untrustedWorkspaces`. The extension starts the bundled language server when `bird2-lsp.serverPath` keeps its default value `["birdcc", "lsp", "--stdio"]` and `node_modules/@birdcc/lsp/dist/server.js` exists in the extension directory. It runs that file with `process.execPath`, the VS Code executable, and sets `ELECTRON_RUN_AS_NODE=1` and `ELECTRON_NO_ASAR=1`, so neither Node.js nor `@birdcc/cli` has to be installed. Otherwise `resolveServerCommand()` splits a string `serverPath` into tokens and rejects shell executables and shell wrappers, and the extension spawns the command without a shell. If `client.start()` fails or does not finish within `bird2-lsp.performance.startupTimeoutMs`, the extension terminates the server process. In that case, and when a running client stops without the extension stopping it, the lifecycle state becomes `error` and the extension starts fallback validation.

An arrow points from a step to the step that follows it.

```mermaid
flowchart TD
  ACT["activate()<br/>extension.ts"] --> EN{"bird2-lsp.enabled is true for a<br/>workspace folder or open bird2 file?"}
  EN -->|"no"| FB["createFallbackValidator()<br/>bird -p on open and save"]
  EN -->|"yes"| START["lifecycle.start()"]
  START --> DEF{"serverPath equals<br/>the default value?"}
  DEF -->|"yes"| BUNDLED{"node_modules/@birdcc/lsp/dist/server.js<br/>exists in the extension?"}
  DEF -->|"no"| CUSTOM["resolveServerCommand(serverPath)<br/>spawn without a shell"]
  BUNDLED -->|"yes"| ELECTRON["spawn process.execPath server.js --stdio<br/>ELECTRON_RUN_AS_NODE=1"]
  BUNDLED -->|"no"| CUSTOM
  ELECTRON --> RACE{"client.start() finishes within<br/>performance.startupTimeoutMs?"}
  CUSTOM --> RACE
  RACE -->|"yes"| RUN["state: running<br/>fallback validator disposed"]
  RACE -->|"no, or start fails"| ERR["state: error<br/>server process terminated"]
  ERR --> FB
  RUN -->|"client stops on its own:<br/>state: error"| FB
```

### Providers in the extension host

Besides the language client, the extension registers its own providers in the extension host. Format Document and Format Selection call `formatBirdConfig()` from `@birdcc/formatter`, with `formatter` options from `bird.config.json` (read by `loadBirdProjectConfigForFile()`) taking precedence over extension settings and editor indentation; Format Selection keeps only the edits inside the selection. Function return-type hover and inlay hints call `collectFunctionReturnHints()` from `@birdcc/core`. Keyword hover calls `resolveKeywordHoverOnLine()` from the `@birdcc/lsp` library and returns nothing while the language server is running for the file. Every provider first applies `enforceLargeFileGuard()` and then the document admission check, which looks for a project file whose `main` points to the document and calls `evaluateBirdDocumentEligibility()`. While the server runs, the language client also registers the server's providers for `bird2` documents, among them Format Document (`documentFormattingProvider`), hover, and inlay hints for AS numbers and function return types. Format Selection has a provider only in the extension host.

An arrow points from a caller to the module it calls.

```mermaid
flowchart LR
  subgraph host ["Extension host"]
    FMT["createBirdFormattingProvider()<br/>Format Document, Format Selection"]
    TH["registerBirdTypeHintProviders()<br/>return-type hover and inlay hints"]
    KH["registerBirdKeywordHoverProvider()<br/>only while the server is not active"]
    GUARD["enforceLargeFileGuard()<br/>performance.maxFileSizeBytes"]
    GATE["createBirdDocumentEligibilityGate()"]
    CLIENT["LanguageClient<br/>registers the server's providers,<br/>including Format Document"]
  end
  FORMATTER["@birdcc/formatter<br/>formatBirdConfig()"]
  CORE["@birdcc/core<br/>collectFunctionReturnHints()<br/>loadBirdProjectConfigForFile()<br/>evaluateBirdDocumentEligibility()"]
  LSPLIB["@birdcc/lsp library<br/>resolveKeywordHoverOnLine()"]
  SERVER["@birdcc/lsp server process"]
  FMT --> GUARD
  TH --> GUARD
  KH --> GUARD
  GUARD --> GATE
  GATE --> CORE
  FMT --> FORMATTER
  FMT --> CORE
  TH --> CORE
  KH --> LSPLIB
  CLIENT -->|"JSON-RPC over stdio"| SERVER
```

### Fallback validation

Fallback validation runs the BIRD binary on saved files and turns its output into diagnostics in the `bird2-fallback` collection with source `bird -p`. A background validator exists while `bird2-lsp.enabled` is `false` or the client is in the `error` state; a second one covers files whose resource-level `enabled` is `false` while the server runs. Background validators check the active file when they start and other files 800 ms after open, or after save while `bird2-lsp.validation.onSave` is `true`; the **BIRD2: Validate Active Document** command uses a separate validator that runs once on demand. Each run passes the same checks before `execFile()` starts the command without a shell. [configuration.md](./configuration.md#validation-command-safety) lists the command template rules.

An arrow points from a trigger or step to the step that follows it.

```mermaid
flowchart TD
  T1["bird2-lsp.enabled is false<br/>runConfigurationLifecycle()"]
  T2["client state: error<br/>onStateChange()"]
  T3["server running, file has enabled false<br/>syncResourceFallback()"]
  T4["BIRD2: Validate Active Document<br/>manualValidator"]
  BG["background validator<br/>open, save (validation.onSave), 800 ms debounce"]
  CHECKS{"saved, validation.enabled, trusted,<br/>size limit, admitted, inside a workspace folder,<br/>not world-writable"}
  APPROVE{"default command, or custom<br/>command allowed this session?"}
  RESOLVE{"resolveValidationCommandTemplate()<br/>accepts the template?"}
  EXEC["execFile(command, args)<br/>no shell, validation.timeout"]
  PARSE["parseBirdValidationOutput()<br/>@birdcc/core"]
  DIAG["diagnostics: bird2-fallback<br/>source bird -p"]
  CLEAR["diagnostics cleared"]
  T1 --> BG
  T2 --> BG
  T3 --> BG
  BG --> CHECKS
  T4 --> CHECKS
  CHECKS -->|"all pass"| APPROVE
  APPROVE -->|"yes"| RESOLVE
  RESOLVE -->|"yes"| EXEC
  EXEC -->|"exit code 0"| CLEAR
  EXEC -->|"non-zero exit or spawn error"| PARSE
  PARSE --> DIAG
```
