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
