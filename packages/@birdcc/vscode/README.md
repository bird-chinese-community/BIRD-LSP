# @birdcc/vscode

VS Code extension package for BIRD2 Language Server Protocol support.

## Features

- Language client bootstrap for `birdcc lsp --stdio`
- Fallback validation with `bird -p`
- Builtin and dprint formatter integration
- Type hints (hover + inlay hints)
- Workspace trust integration and command hardening
- Large-file guard for expensive extension-side operations

## Development

```bash
pnpm --filter @birdcc/vscode build
pnpm --filter @birdcc/vscode typecheck
pnpm --filter @birdcc/vscode lint
pnpm --filter @birdcc/vscode test
pnpm --filter @birdcc/vscode format
```

## Configuration

Main settings use the `bird2-lsp.*` namespace.

| Key                                      | Type                               | Default                      | Description                                              |
| ---------------------------------------- | ---------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `bird2-lsp.enabled`                      | `boolean`                          | `true`                       | Enable language client startup.                          |
| `bird2-lsp.serverPath`                   | `string \| string[]`               | `['birdcc','lsp','--stdio']` | LSP server command tokens.                               |
| `bird2-lsp.trace.server`                 | `'off' \| 'messages' \| 'verbose'` | `'off'`                      | Language client trace level.                             |
| `bird2-lsp.validation.enabled`           | `boolean`                          | `true`                       | Enable fallback `bird -p` validation.                    |
| `bird2-lsp.validation.command`           | `string`                           | `'bird -p -c {file}'`        | Validation template (`{file}` must be standalone token). |
| `bird2-lsp.validation.onSave`            | `boolean`                          | `true`                       | Run fallback validation on save.                         |
| `bird2-lsp.validation.timeout`           | `number`                           | `30000`                      | Validation timeout in milliseconds.                      |
| `bird2-lsp.performance.maxFileSizeBytes` | `number`                           | `2097152`                    | Skip expensive extension-side features above threshold.  |
| `bird2-lsp.formatter.engine`             | `'dprint' \| 'builtin'`            | `'dprint'`                   | Preferred formatter engine.                              |
| `bird2-lsp.formatter.safeMode`           | `boolean`                          | `true`                       | Safe mode for formatter output validation.               |
| `bird2-lsp.typeHints.enabled`            | `boolean`                          | `true`                       | Enable type hints.                                       |
| `bird2-lsp.typeHints.hover.enabled`      | `boolean`                          | `true`                       | Enable hover return-type hints.                          |
| `bird2-lsp.typeHints.inlay.enabled`      | `boolean`                          | `true`                       | Enable inlay return-type hints.                          |

See [`docs/configuration.md`](./docs/configuration.md) for details.
