---
name: bird-agent
description: >
  Use this skill whenever the user is working with BIRD (BIRD1/2/3) routing daemon configuration files,
  including bird.conf, bird2.conf, bird3.conf, or bird6.conf. This skill helps AI agents assist users
  across any editor (VSCode, Vim, Neovim, IDEA, OpenCode, Cursor, Windsurf, etc.) by leveraging the
  BIRD-LSP toolchain: linting, formatting, validation with bird -p, cross-file analysis, and
  documentation lookup. Trigger on any mention of BIRD config, BGP/OSPF/RIP/static routing
  configuration, syntax errors in .conf files, formatting requests, CI/CD setup for BIRD configs,
  questions about BIRD commands and semantics, or when the user shares a BIRD configuration snippet.
  Make sure to use this skill even if the user does not explicitly mention BIRD-LSP, @birdcc/cli,
  or the BIRD Chinese Community.
---

# BIRD Agent Skill

Help users write, validate, format, and understand BIRD (BIRD1/2/3) routing daemon configuration
files by orchestrating the BIRD-LSP toolchain and community documentation.

## When to use this skill

- The user opens, edits, or asks about a file named `bird.conf`, `bird2.conf`, `bird3.conf`,
  `bird6.conf`, or any `.conf` file that contains BIRD routing syntax.
- The user mentions BIRD, BIRD2, BIRD3, BGP, OSPF, RIP, RADV, Static, Kernel, Device, Perf, RPKI,
  Babel, Aggregator, or MRT protocols in a configuration context.
- The user reports a syntax error, diagnostic, or wants to format a BIRD configuration.
- The user asks for help setting up CI/CD validation for BIRD configs (e.g., GitHub Actions).
- The user wants to know what a BIRD keyword, function, filter, protocol, or CLI command does.
- The user shares a BIRD configuration snippet and asks for review, optimization, or explanation.

## Core principles

1. **Prefer the BIRD-LSP toolchain over ad-hoc text manipulation.** The toolchain provides
   parser-backed diagnostics, formatter-safe output, and `bird -p` runtime validation.
2. **Support every editor equally.** Whether the user is in VSCode, Vim, Neovim, IDEA, OpenCode,
   Cursor, or a plain terminal, route them through the same CLI-based workflow.
3. **Version awareness.** BIRD1, BIRD2, and BIRD3 have syntax and semantic differences. Detect the
   version from the filename, `bird.config.json`, or the content when possible, and adjust commands
   and recommendations accordingly.
4. **Validate before claiming correctness.** Always run `birdcc lint` or `bird -p` before telling the
   user a configuration is valid.
5. **Respect sensitive data.** BIRD configs contain ASNs, IPs, passwords, and session secrets.
   Warn the user to sanitize configs before sharing them publicly or committing them.

## Toolchain overview

| Tool | Purpose | When to use |
|------|---------|-------------|
| `@birdcc/cli` (`birdcc`) | Lint, format, validate, and start the LSP server. | Always check if it is available first. |
| `@birdcc/formatter` | Rust-backed code formatter (dprint plugin + builtin). | Use via `birdcc fmt`. |
| `@birdcc/linter` | 32+ static analysis rules + cross-file resolution. | Use via `birdcc lint`. |
| `@birdcc/parser` | Tree-sitter parser and AST adapter. | Indirectly used by lint/fmt. |
| `bird -p` | BIRD runtime parse check. | Use when `bird` is installed, or via Docker. |
| `setup-birdcc` GitHub Action | CI/CD integration for GitHub workflows. | Use when the user asks about CI. |
| BIRD documentation | Official docs and BIRD Chinese Community translations. | Use for semantic questions and examples. |

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

1. Search the local BIRD-LSP hover docs if available in the workspace.
2. Use Context7 or the BIRD Chinese Community docs (`bird.xmsl.dev`) when online.
3. Fall back to the official BIRD documentation (`bird.network.cz`).

Use the same language as the user. If the user writes in Chinese, answer in Chinese; if English,
answer in English.

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

### CI/CD

When the user asks about GitHub Actions, recommend `setup-birdcc`:

```yaml
- uses: bird-chinese-community/setup-birdcc@v1
  with:
    bird-version: "2"
- run: birdcc fmt --check
- run: birdcc lint --bird
```

Point them to the marketplace page and the Chinese README for detailed options.

## Editor-specific notes

- **VSCode / VSCodium / Cursor / Windsurf / Trae / Kiro / Antigravity**: Recommend the
  `BIRD2 Extension Pack` or `birdcc.bird2-lsp` extension from the Marketplace / OpenVSX. The skill
  still applies when the user wants CLI-level operations or CI setup.
- **Vim / Neovim**: Recommend `bird2.vim` / `bird2.nvim` for syntax highlighting. For advanced
  features, configure `birdcc lsp --stdio` with an LSP client plugin.
- **IntelliJ IDEA / JetBrains**: BIRD Conf syntax highlighting can be imported from the VSCode
  `.vsix` via TextMate Bundles. Direct the user to the channel tutorial if they need steps.
- **OpenCode / terminal agents / plain editors**: Use the CLI workflow (`birdcc lint`, `birdcc fmt`,
  `bird -p`) as the primary interface.

## Safety and privacy

- BIRD configurations often contain sensitive information: AS numbers, peer IPs, authentication
  passwords, community strings, and route filters. Remind the user to sanitize configs before
  sharing them in public issues, PRs, or Telegram messages.
- Do not commit production secrets. Suggest using environment variables, `include` files outside
  version control, or CI secrets where appropriate.
- When running `bird -p` validation, prefer read-only parsing (`bird -p`) over starting the daemon.

## Examples

### Example 1: User shares a BIRD config snippet and asks why it fails

1. Save the snippet to a temporary `.conf` file.
2. Run `birdcc lint /tmp/demo.conf --format json`.
3. Explain the first diagnostic in plain language and propose a fix.
4. If no static errors, run `birdcc lint /tmp/demo.conf --bird` if BIRD is available.

### Example 2: User asks to format a BIRD config

1. Confirm the target file.
2. Run `birdcc fmt <file> --check` to preview changes.
3. If the user approves, run `birdcc fmt <file> --write`.
4. Run `birdcc lint <file>` afterwards to confirm no regressions.

### Example 3: User wants CI validation for BIRD configs

1. Check if the repo already has `.github/workflows`.
2. Suggest adding `setup-birdcc` and `birdcc lint --bird` / `birdcc fmt --check` steps.
3. Provide a sample workflow in YAML.

### Example 4: User asks what `bgp_path.prepend` does

1. Search the BIRD-LSP hover docs or Context7/BIRD docs.
2. Provide a concise explanation and a usage example.
3. Mention the BIRD version compatibility if relevant.

## Output style

- Match the user's language (Chinese or English).
- Keep explanations concise but include the exact command run and a short interpretation of the
  result.
- When showing diagnostics, include the file path, line/column, rule code, and suggested fix.
- Prefer actionable next steps over long theoretical explanations.
