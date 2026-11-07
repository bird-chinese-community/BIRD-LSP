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
configuration files that qualify as BIRD files. A file qualifies when it has a
canonical name (`bird.conf`, `bird2.conf`, `bird3.conf`, or `bird6.conf`,
with an optional leading dot, in any letter case), even while it is empty or
temporarily invalid, or when it contains BIRD declarations parsed by
Tree-sitter. Other file names and directory depth only rank qualifying
candidates. A file that `main` points to always qualifies.

Ambiguous and multi-entry layouts are reported for review instead of being
silently written as `main`. Relative and glob includes are resolved from the
including file, and only existing reachable files contribute to entry ranking.

## VS Code Extension Settings

### Large File Guard

`bird2-lsp.performance.maxFileSizeBytes` (default 2097152 bytes) controls heavy editor features:

- formatter provider
- fallback validator
- type hint providers (hover and inlay hints)
- keyword hover provider, used while the language server is not running for the file

When a file exceeds this limit, these features are skipped. The extension writes the reason to the `BIRD2 LSP` output channel and shows an error notification with links to the FAQ. The language server does not analyze files larger than the smallest of this limit, `crossFile.maxDocumentBytes`, and `crossFile.maxTotalBytes` (16 MiB by default) in `bird.config.json`, and reports an `analysis/size-limit` warning on the first line instead.

### Validation Command Safety

`bird2-lsp.validation.command` is checked before execution:

- must include `{file}`
- `{file}` must be a standalone token: `bird -p -c {file}` is accepted, `bird -p --config={file}` is rejected
- shell metacharacters `;`, `&`, `|`, `` ` ``, `$`, `<`, and `>` are rejected
- environment variable expansion (`${env:NAME}`, `%NAME%`) is rejected
- arguments containing NUL, carriage return, or line feed characters are rejected
- the first token must not be a shell (`bash`, `sh`, `zsh`, `fish`, `cmd`, `powershell`, `pwsh`), so shell wrappers such as `sh -c` are blocked

The extension runs the command with `execFile`, without a shell, and stops it after `bird2-lsp.validation.timeout` milliseconds. A command other than `bird -p -c {file}` runs only after the user confirms it in a dialog, once per session.

Validation runs only when all of these hold:

- `bird2-lsp.validation.enabled` is `true`
- the workspace is trusted
- the file is saved
- when a folder is open, the file is inside one of the workspace folders
- the file is within `bird2-lsp.performance.maxFileSizeBytes`
- the file is a BIRD file: `main` points to it, it has a canonical name such as `bird.conf`, or it contains BIRD declarations
- on macOS and Linux, the file is not writable by all users

`bird.validateCommand` in `bird.config.json` is a separate setting used by the `bird -p` check of `birdcc lint` (`--bird` or `linter.withBird`); the extension does not read it.

Recommended value:

```json
{
  "bird2-lsp.validation.command": "bird -p -c {file}"
}
```

## Troubleshooting

- FAQ: [./faq.md](./faq.md)
- GitHub Issues: <https://github.com/bird-chinese-community/BIRD-LSP/issues>
