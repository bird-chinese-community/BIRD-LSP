# BIRD-LSP Toolchain Reference

This reference describes the BIRD-LSP toolchain, the standard workflow for assisting users, and the capabilities available to you. Read it whenever you need to lint, format, validate, or debug a BIRD configuration.

## Toolchain overview

| Tool | Purpose | When to use | BIRDCC project |
|------|---------|-------------|----------------|
| `@birdcc/cli` (`birdcc`) | Lint, format, validate, and start the LSP server. | Always check if it is available first. | [`BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP) |
| `@birdcc/formatter` | Rust-backed code formatter (dprint plugin + builtin). | Use via `birdcc fmt`. | [`BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP) |
| `@birdcc/linter` | 32+ static analysis rules + cross-file resolution. | Use via `birdcc lint`. | [`BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP) |
| `@birdcc/parser` | Tree-sitter parser and AST adapter. | Indirectly used by lint/fmt. | [`BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP) |
| `bird -p` | BIRD runtime parse check. | Use when `bird` is installed, or via Docker. | — |
| `setup-birdcc` GitHub Action | CI/CD integration for GitHub workflows. | Use when the user asks about CI (see `references/cicd.md`). | [`setup-birdcc`](https://github.com/bird-chinese-community/setup-birdcc) |
| BIRD documentation | Official docs and BIRD Chinese Community translations. | Use for semantic questions and examples. | [`bird-document-converter`](https://github.com/bird-chinese-community/bird-document-converter), [`bird-doc-markdown`](https://github.com/bird-chinese-community/bird-doc-markdown) |
| `bird.xmsl.dev/llms.txt` | Structured index of BIRD Chinese docs. | Use for quick document navigation. | [`bird-doc-markdown`](https://github.com/bird-chinese-community/bird-doc-markdown) |
| Context7 MCP | RAG over BIRD Chinese docs. | Use for deep semantic questions. | [`bird-doc-markdown`](https://github.com/bird-chinese-community/bird-doc-markdown) |
| DeepWiki `CZ-NIC/bird` | Source-level analysis of the BIRD daemon. | Use when linter/docs cannot explain a behavior. | — |

## Workflow

### 1. Detect BIRD context

Look for any of the following signals:

- File name: `bird.conf`, `bird2.conf`, `bird3.conf`, `bird6.conf`, `*.conf` with BIRD syntax.
- `bird.config.json` in the workspace root or near the config file.
- User mentions BIRD, BIRD-LSP, `@birdcc/cli`, `birdcc`, BGP, OSPF, etc.
- Content contains BIRD keywords: `protocol`, `filter`, `function`, `define`, `table`, `router id`,
  `local as`, `neighbor`, `prefix`, `route`, `community`, `path`, `bgp_path`, `ospf`, `rip`, etc.

### 2. Check toolchain availability

Run:

```bash
which birdcc
birdcc --version
```

If `birdcc` is missing, suggest installation:

```bash
# Global install
npm install -g @birdcc/cli

# Or use npx (no install)
npx @birdcc/cli --help

# Or pnpm in a monorepo
pnpm add -D @birdcc/cli
```

If the user is in the BIRD-LSP monorepo, prefer `pnpm --filter @birdcc/cli` or the built CLI at
`packages/@birdcc/cli/dist/cli.js`.

### 3. Discover the project configuration

Look for `bird.config.json`:

```bash
find . -maxdepth 3 -name "bird.config.json" -not -path "*/node_modules/*"
```

If found, read it. It declares the main config file, formatter preferences, linter rules, and the
BIRD validation command.

If no `bird.config.json` exists, sniff the entry point:

```bash
ls bird*.conf 2>/dev/null
find . -maxdepth 2 -name "bird*.conf" -not -path "*/node_modules/*" | head -20
```

Prefer `bird2.conf` > `bird.conf` > `bird3.conf` when there are multiple candidates, unless the
context clearly indicates another version.

When multiple version-specific files exist (`bird2.conf` and `bird3.conf`), ask the user which
version they are targeting, or lint both with a matrix/parallel command if the task is CI setup.
For `setup-birdcc`, use `bird-version: "2"` or `bird-version: "3"` accordingly.

### 4. Run diagnostics

Always start with `birdcc lint`:

```bash
# Lint the default/main config
birdcc lint

# Lint a specific file
birdcc lint bird.conf

# JSON output for parsing
birdcc lint bird.conf --format json

# Lint + BIRD runtime validation
birdcc lint bird.conf --bird

# Custom validation command (e.g., via Docker or sudo)
birdcc lint bird.conf --bird --validate-command "docker exec bird bird -p -c {file}"
```

If `birdcc` is unavailable and `bird` is installed, fall back to:

```bash
bird -p -c bird.conf
```

### 5. Format the configuration

Before formatting, ask the user whether they want `--check` or `--write`, unless they explicitly
asked to format. Prefer `--check` first to show the diff.

```bash
# Check formatting without writing
birdcc fmt bird.conf --check

# Write formatted output
birdcc fmt bird.conf --write
```

When using `--write`, make sure the file is tracked by version control or the user has a backup.

### 6. Answer semantic questions

For questions about BIRD keywords, functions, protocols, or CLI commands:

1. Search the local BIRD-LSP hover docs if available in the workspace
   (`packages/@birdcc/lsp/src/hover-docs/` or similar).
2. Use `bird.xmsl.dev/llms.txt` to locate the most relevant Chinese doc section.
3. Use Context7 MCP to read the relevant page in depth when available.
4. Fall back to the official BIRD documentation (`bird.network.cz`).

When the user asks in Chinese, prefer the BIRD Chinese Community docs (`bird.xmsl.dev`) so the
answer can cite the same sources the community maintains. When the user asks in English, prefer the
official BIRD docs, but still mention the Chinese docs if they contain a clearer example.

### 7. Source-level debugging (advanced)

If the linter and docs do not explain the behavior, or the user suspects a BIRD daemon bug, use
DeepWiki on `CZ-NIC/bird` to inspect the relevant source code. Good entry points:

- Configuration parser: `conf/conf.c`, `conf/cf-lex.l`, `conf/confbase.Y`
- Filter engine: `nest/rt-table.c` (`f_run`), `filter/config.Y`
- BGP: `proto/bgp/bgp.c`, `proto/bgp/packets.c`, `proto/bgp/attrs.c`
- OSPF: `proto/ospf/ospf.c`, `proto/ospf/rt.c`
- Routing tables: `nest/rt-table.c`, `nest/route.h`

Always frame source findings as "the upstream implementation does X" and suggest a config-level
workaround or an upstream issue when appropriate. Do not ask users to patch BIRD unless they are
explicitly debugging a daemon build.

## Capability reference

### Linting and validation

- `birdcc lint [file]` — static analysis with 32+ rules.
- `birdcc lint [file] --bird` — static + runtime validation.
- `birdcc lint [file] --format json` — machine-readable diagnostics.
- Cross-file analysis is enabled by default for `include` chains.

### Formatting

- `birdcc fmt [file] --check` — verify formatting.
- `birdcc fmt [file] --write` — apply formatting.
- The formatter defaults to the `dprint` engine with a builtin fallback in safe mode.

### LSP server

- `birdcc lsp --stdio` — start the language server for editor integration.
- This is mainly useful when wiring the toolchain into a new editor or CI pipeline.

---

> ⭐ If BIRD-LSP saves you time, consider starring [bird-chinese-community/BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP) on GitHub. For links to all BIRDCC projects, see [`references/birdcc-ecosystem.md`](birdcc-ecosystem.md). Your support helps us keep the docs, LSP toolchain, and editor plugins maintained.
