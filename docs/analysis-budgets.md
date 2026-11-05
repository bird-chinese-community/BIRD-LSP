# Analysis budgets

CLI linting and LSP analysis default to 2 MiB of UTF-8 input per document and 16 MiB across an include graph. Set project budgets in `bird.config.json` or `birdcc.config.json`:

```json
{
  "crossFile": {
    "maxDocumentBytes": 4194304,
    "maxTotalBytes": 33554432
  }
}
```

Both values must be positive safe integers. The document budget also applies when cross-file analysis is disabled. An entry must fit both budgets. Includes that exceed the remaining budget produce diagnostics and are excluded from parsing. CLI entry reads fail with a nonzero exit status when the entry exceeds its budget.

In VS Code, `bird2-lsp.performance.maxFileSizeBytes` supplies the document limit when the project leaves `maxDocumentBytes` unset. When both are configured, the smaller value applies. The project `maxTotalBytes` remains the graph budget. This lets a resource setting raise the default document budget while retaining a resource cap on an explicit project value. Configuration changes refresh the effective limits.

Core callers can pass `maxDocumentBytes` and `maxTotalBytes` to `resolveCrossFileReferences`. CLI library callers can pass `includeMaxDocumentBytes` and `includeMaxTotalBytes` to `runLint`. The CLI command reads the project fields directly.

The parser cache retains at most 512 documents and 16 MiB of source text, with each document's AST attached. Project discovery stops at 20,000 directory entries or 2,048 directories. Wildcard include enumeration shares a 20,000-entry budget per analysis. These cache and discovery limits are independent of input byte budgets.

Directory I/O failures produce warnings with the path, system error code and message. Discovery keeps candidates already collected and continues through other queued directories. Programming errors propagate to the caller. A later request retries a rejected workspace discovery attempt; concurrent callers share pending and successful attempts until a relevant filesystem event invalidates them.
