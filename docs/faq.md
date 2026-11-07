# BIRD-LSP FAQ

This page collects frequent VS Code extension issues and quick recovery steps.

## FAQ: file-too-large

### Symptoms

- Formatting, type hints, keyword hover, or fallback validation are skipped for a large BIRD file.
- You see an alert similar to: `skipped ... for large file`.

### Why it happens

The extension protects editor responsiveness with `bird2-lsp.performance.maxFileSizeBytes` (default 2097152 bytes). The language server does not analyze files above the same limit.

### How to fix

1. Increase `bird2-lsp.performance.maxFileSizeBytes` in VS Code settings.
2. Split extremely large configs into include files.
3. Run `birdcc lint` and `birdcc fmt` in a terminal or in CI. `birdcc lint` fails on files larger than 2 MiB by default; raise `crossFile.maxDocumentBytes` in `bird.config.json` for larger files.

---

## FAQ: type-hints-runtime-failed

### Symptoms

- Inlay hints/hover type hints stop working.
- Output channel logs contain `type hints ... failed` errors.

### How to fix

1. Update the extension to the latest version.
2. Run `Developer: Reload Window`. The type hint hover and inlay providers that report this error run in the extension host, so `BIRD2: Restart Language Server` does not reset them.
3. To turn the feature off, set `bird2-lsp.typeHints.enabled` to `false`.
4. If the problem persists, collect logs from the `BIRD2 LSP` output channel and open an issue.

### What to include in issue

- Extension version
- VS Code version
- OS
- Minimal reproducible config snippet
- Output channel logs

---

## FAQ: validation-command-failed

### Symptoms

- Fallback validation cannot run successfully.
- Validation command errors appear in output logs.

### How to fix

1. Ensure `bird2-lsp.validation.command` contains `{file}` as a standalone token and passes the other checks in [Validation Command Safety](./configuration.md#validation-command-safety).
2. If the error contains `ENOENT`, install BIRD 2 or BIRD 3, or set the command to the absolute path of the binary, for example `/usr/sbin/bird -p -c {file}`.
3. Verify your command works in terminal with a real file path.
4. Start from the default command, `bird -p -c {file}`.
5. Validation runs only for saved files in a trusted workspace and, when a folder is open, inside a workspace folder. The output channel logs the reason when it skips an unsaved file, an untrusted workspace, a file outside the workspace folders, or a file writable by all users.

---

## FAQ: extension-command-failed

### Symptoms

- A command such as restart/format/validate/reload fails in Command Palette.
- You see an error popup with quick actions to open FAQ or report issue.

### How to fix

1. Retry once after `BIRD2: Restart Language Server`.
2. Check extension output logs (`BIRD2 LSP`).
3. Confirm that the workspace is trusted and required binaries are available.
4. If still failing, use `Report Issue` and include logs.

---

## More help

- Issues: <https://github.com/bird-chinese-community/BIRD-LSP/issues>
- New issue: <https://github.com/bird-chinese-community/BIRD-LSP/issues/new/choose>
