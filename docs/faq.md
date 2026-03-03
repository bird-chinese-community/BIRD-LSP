# BIRD-LSP FAQ

This page collects frequent VS Code extension issues and quick recovery steps.

## FAQ: file-too-large

### Symptoms

- Formatting/type hints/fallback validation are skipped for a large `.conf` file.
- You see an alert similar to: `skipped ... for large file`.

### Why it happens

The extension protects editor responsiveness with `bird2-lsp.performance.maxFileSizeBytes`.

### How to fix

1. Increase `bird2-lsp.performance.maxFileSizeBytes` in VS Code settings.
2. Split extremely large configs into include files.
3. Keep heavy realworld checks in CLI/CI (`birdcc lint`, `birdcc fmt`) instead of interactive editor features.

---

## FAQ: type-hints-runtime-failed

### Symptoms

- Inlay hints/hover type hints stop working.
- Output channel logs contain `type hints ... failed` errors.

### How to fix

1. Upgrade to the latest extension version (older versions had a regex runtime bug in type-hints inference).
2. Run `BIRD2: Restart Language Server`.
3. If the problem persists, collect logs from `BIRD2 LSP (Beta)` output channel and open an issue.

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

1. Ensure `bird2-lsp.validation.command` contains `{file}` as a standalone token.
2. Verify your command works in terminal with a real file path.
3. Prefer a simple command first, for example: `bird -p -c {file}`.

---

## More help

- Issues: <https://github.com/bird-chinese-community/BIRD-LSP/issues>
- New issue: <https://github.com/bird-chinese-community/BIRD-LSP/issues/new/choose>
