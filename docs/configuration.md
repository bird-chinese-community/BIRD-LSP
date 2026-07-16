# Configuration Guide

This guide documents project-level and extension-level configuration for BIRD-LSP.

## Project Entry (`bird.config.json`)

Use `bird.config.json` as the entry file of a BIRD project.

- Full spec: [./spec.md](./spec.md)
- JSON schema: `schemas/bird.config.schema.json`

Minimal example:

```json
{
  "$schema": "https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/schemas/bird.config.schema.json",
  "main": "bird.conf",
  "bird": {
    "validateCommand": "bird -p -c {file}"
  }
}
```

### Automatic entry detection

Without a project file, `birdcc init` and editor integrations only auto-select
configuration files that contain Tree-sitter-parsed BIRD declarations. File
names and directory depth rank eligible candidates but do not establish BIRD
language identity by themselves. Canonical names such as `bird.conf`,
`bird2.conf`, `bird3.conf`, and `bird6.conf` remain valid while empty or
temporarily invalid, and an explicit `main` value always records user intent.

Ambiguous and multi-entry layouts are reported for review instead of being
silently written as `main`. Relative and glob includes are resolved from the
including file, and only existing reachable files contribute to entry ranking.

## VS Code Extension Settings

### Large File Guard

`bird2-lsp.performance.maxFileSizeBytes` controls heavy editor features:

- formatter provider
- fallback validator
- type hint providers

When a file exceeds this limit, extension features are skipped and an alert will guide you to FAQ.

### Validation Command Safety

`bird2-lsp.validation.command` is checked before execution:

- must include `{file}`
- `{file}` must be a standalone token
- shell wrappers are blocked

Recommended value:

```json
{
  "bird2-lsp.validation.command": "bird -p -c {file}"
}
```

## Troubleshooting

- FAQ: [./faq.md](./faq.md)
- GitHub Issues: <https://github.com/bird-chinese-community/BIRD-LSP/issues>
