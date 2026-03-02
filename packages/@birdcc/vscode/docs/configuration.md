# Configuration Guide

This document describes supported VS Code settings for `@birdcc/vscode`.

## Validation Command Safety

`bird2-lsp.validation.command` is validated before execution.

Rules:

- Must contain `{file}` placeholder.
- `{file}` must be a standalone command token.
- Shell wrappers and direct shell executables are blocked.
- Environment expansion syntax such as `${env:HOME}` and `%APPDATA%` is blocked.

Recommended template:

```json
{
  "bird2-lsp.validation.command": "bird -p -c {file}"
}
```

## Large File Guard

`bird2-lsp.performance.maxFileSizeBytes` controls extension-side expensive operations:

- formatter provider
- fallback validator
- type hint providers

If a document exceeds this threshold, these features are skipped and a warning is shown.

Example:

```json
{
  "bird2-lsp.performance.maxFileSizeBytes": 4194304
}
```

## Startup Timeout Guard

`bird2-lsp.performance.startupTimeoutMs` limits how long extension startup waits for the language server to become ready.

- If startup exceeds this timeout, the extension logs a warning and keeps fallback validation available.
- This helps avoid long activation stalls when server binaries are slow or unavailable.

Example:

```json
{
  "bird2-lsp.performance.startupTimeoutMs": 15000
}
```
