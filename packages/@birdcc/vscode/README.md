<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/vscode/assets/icon-256.png" width="96" height="96" alt="BIRD2 LSP" />

# BIRD2 LSP

VS Code extension for BIRD 2 and BIRD 3 configuration files, built on the bundled `@birdcc/lsp` language server.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/BIRDCC.bird2-lsp.svg?label=VS%20Marketplace&color=007ACC&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp)
[![Open VSX](https://img.shields.io/open-vsx/v/BIRDCC/bird2-lsp?style=flat-square&label=Open%20VSX&color=C160EF)](https://open-vsx.org/extension/BIRDCC/bird2-lsp)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

BIRD2 LSP starts the `@birdcc/lsp` language server that ships inside the extension and runs it on the JavaScript runtime of VS Code itself. The server parses configurations with Tree-sitter, follows `include` statements across files, and reports diagnostics from 32 lint rules. The extension host adds formatting, function return-type hints, and a fallback validator that runs `bird -p`. Syntax highlighting comes from the separate BIRD2 Configuration extension (`BIRDCC.vscode-bird2-conf`).

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp) by searching for `BIRD2 LSP` in the Extensions view, or from a terminal:

```bash
code --install-extension BIRDCC.bird2-lsp
```

To install the extension together with syntax highlighting, install [BIRD2 Extension Pack](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack). It adds `BIRDCC.bird2-lsp` and `BIRDCC.vscode-bird2-conf`:

```bash
code --install-extension BIRDCC.bird2-extension-pack
```

VSCodium and other editors that use Open VSX can install [BIRDCC/bird2-lsp](https://open-vsx.org/extension/BIRDCC/bird2-lsp) and [BIRDCC/bird2-extension-pack](https://open-vsx.org/extension/BIRDCC/bird2-extension-pack).

For offline installation, download `bird2-lsp.vsix` from a release tagged `bird2-lsp-v<version>` on [GitHub Releases](https://github.com/bird-chinese-community/BIRD-LSP/releases) and install the file:

```bash
code --install-extension bird2-lsp.vsix
```

## Requirements

- VS Code 1.100 or newer.
- Node.js and `@birdcc/cli` are not required. The extension package contains `@birdcc/lsp` and its dependencies, and the extension starts `node_modules/@birdcc/lsp/dist/server.js` with the VS Code executable (`ELECTRON_RUN_AS_NODE=1`).
- Fallback validation runs the BIRD binary (`bird -p -c {file}` by default) and needs BIRD 2 or BIRD 3 on the machine. Without it, the validator reports the failed command as an error on the first line of the file. Language server features do not use the BIRD binary.
- The extension manifest does not declare support for untrusted workspaces, so VS Code keeps the extension disabled in Restricted Mode until you trust the workspace.

## Features

| Feature                      | Behavior                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostics                  | 32 lint rules in six groups (`sym`, `cfg`, `net`, `type`, `bgp`, `ospf`) analyzed across the `include` graph. Parser and semantic errors are reported under the same rule codes. `sym`, `cfg`, `net`, and `type` rules report warnings and `bgp` and `ospf` rules report information by default; `linter.rules` in `bird.config.json` changes the levels or turns rules off. |
| Completion                   | 14 keywords, 4 statement templates, names declared in the `include` graph, and paths already used by `include` statements. After `import filter`, `export filter`, `table`, and `from`, only matching declarations are listed. Trigger characters are space and `.`.                                                                                                         |
| Hover                        | Keyword documentation with links to the BIRD User's Guide, and details of declared symbols.                                                                                                                                                                                                                                                                                  |
| Go to definition, references | Go to definition resolves a name to the declaration of the protocol, template, filter, function, table, or `define` constant with that name anywhere in the `include` graph. Find references returns that declaration plus the `from` clauses that name a template; other uses of filters, functions, tables, protocols, and constants are not reported.                     |
| Outline                      | Document symbols for top-level declarations.                                                                                                                                                                                                                                                                                                                                 |
| Formatting                   | Format Document and Format Selection run `@birdcc/formatter` with the `dprint` engine (default) or the `builtin` engine, with safe mode on by default. Format Selection formats the whole file and applies only the edits inside the selection. `formatter` options in `bird.config.json` take precedence over extension settings and editor indentation.                    |
| Function return types        | Hover on a function name shows the declared and inferred return type and up to five return expressions. Inlay hints show the type after the function name.                                                                                                                                                                                                                   |
| ASN information              | Completion, hover, and inlay hints for AS numbers, read from the BGP.Tools OpenDB snapshot bundled in `@birdcc/intel`. No network requests are made.                                                                                                                                                                                                                         |
| Snippets                     | 40 snippets, listed under Snippets below.                                                                                                                                                                                                                                                                                                                                    |
| Fallback validation          | Runs `bird -p` on saved files when the language server is off or failed, described under Fallback validation below.                                                                                                                                                                                                                                                          |
| Status bar                   | Shows `BIRD2: LSP`, `Starting`, `Stopping`, `Idle`, `Error`, or `Fallback`. Clicking it restarts the server, opens the output channel, or runs validation, depending on the state.                                                                                                                                                                                           |

The language server provides diagnostics, completion, hover, definitions, references, document symbols, document formatting, ASN features, and inlay hints for ASNs and function return types. The extension host registers its own providers for Format Document, Format Selection, function return-type hover and inlay hints, and keyword hover while the server is not running for a file. It also runs fallback validation and updates the status bar item. Snippets come from the extension manifest.

## File association

The extension registers the language ID `bird2` for these files:

- Extensions: `.conf`, `.bird`, `.bird2`, `.bird3`, `.bird2.conf`, `.bird3.conf`
- File names: `bird.conf`, `bird2.conf`

Because `.conf` is shared with other software, analysis, formatting, type hints, keyword hover, and fallback validation apply only to files that meet one of these conditions:

1. `main` in `bird.config.json` (or `birdcc.config.json`) points to the file.
2. The file name is `bird.conf`, `bird2.conf`, `bird3.conf`, or `bird6.conf`, optionally with a leading dot, in any letter case.
3. The parser finds at least one BIRD declaration: `router id`, `include`, `define`, `filter`, `function`, `template`, `table`, `attribute`, or a `protocol` of a known BIRD protocol type, among others.

Other files, such as an `nginx.conf` without BIRD declarations, keep the `bird2` language mode but receive no diagnostics and no formatting edits.

## Settings

| Setting                                  | Default                                                  | Description                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bird2-lsp.enabled`                      | `true`                                                   | Run the language server. Files for which this is `false` get no server features and are checked by fallback validation. The server runs while at least one workspace folder or open `bird2` file has `true`. |
| `bird2-lsp.serverPath`                   | `["birdcc", "lsp", "--stdio"]`                           | Language server command as a string or an array. The default value starts the bundled server. Any other value runs that command, for example `["/usr/local/bin/birdcc", "lsp", "--stdio"]`.                  |
| `bird2-lsp.trace.server`                 | `"off"`                                                  | Protocol tracing in the `BIRD2 LSP` output channel: `off`, `messages`, or `verbose`.                                                                                                                         |
| `bird2-lsp.hiddenErrors`                 | `["textDocument/definition", "textDocument/references"]` | LSP request methods whose failures do not show a notification.                                                                                                                                               |
| `bird2-lsp.validation.enabled`           | `true`                                                   | Allow fallback validation.                                                                                                                                                                                   |
| `bird2-lsp.validation.command`           | `"bird -p -c {file}"`                                    | Fallback validation command. `{file}` is replaced with the path of the saved file.                                                                                                                           |
| `bird2-lsp.validation.onSave`            | `true`                                                   | Run fallback validation when a file is saved.                                                                                                                                                                |
| `bird2-lsp.validation.timeout`           | `30000`                                                  | Fallback validation timeout in milliseconds, 1000 to 120000.                                                                                                                                                 |
| `bird2-lsp.performance.maxFileSizeBytes` | `2097152`                                                | File size limit in bytes, 65536 to 104857600. Larger files get no formatting, type hints, keyword hover, or fallback validation from the extension, and the language server does not analyze them.           |
| `bird2-lsp.performance.startupTimeoutMs` | `10000`                                                  | Time in milliseconds, 1000 to 120000, for the language server to start. After it, the extension stops the server and switches to fallback validation.                                                        |
| `bird2-lsp.formatter.engine`             | `"dprint"`                                               | Formatter engine: `dprint` or `builtin`.                                                                                                                                                                     |
| `bird2-lsp.formatter.safeMode`           | `true`                                                   | Reject formatter output whose parsed declarations differ from the input.                                                                                                                                     |
| `bird2-lsp.typeHints.enabled`            | `true`                                                   | Function return-type hover and inlay hints.                                                                                                                                                                  |
| `bird2-lsp.typeHints.hover.enabled`      | `true`                                                   | Return-type details when hovering a function name.                                                                                                                                                           |
| `bird2-lsp.typeHints.inlay.enabled`      | `true`                                                   | Return-type inlay hints after function names.                                                                                                                                                                |
| `bird2-lsp.intel.enabled`                | `true`                                                   | ASN intelligence and optional DN42 IP/ASN hover.                                                                                                                                                             |
| `bird2-lsp.intel.inlayHints`             | `true`                                                   | ASN inlay hints with the country flag and AS number.                                                                                                                                                         |
| `bird2-lsp.intel.completion`             | `true`                                                   | ASN completion.                                                                                                                                                                                              |
| `bird2-lsp.intel.hover`                  | `true`                                                   | ASN intelligence and enabled DN42 IP/ASN details on hover.                                                                                                                                                   |

Set `bird2-lsp.intel.dn42.enabled` to `true` in user settings to asynchronously download the DN42 IPDB bundle and check for updates daily. The default is `false`. IP hover includes English location names, Anycast and service observations, PTR results, and registry-derived ROA/IRR policy. ASN hover shows registration countries and member-prefix observations. The `intel.enabled` and `intel.hover` settings also control DN42 hover.

Changing `serverPath` or `trace.server` restarts the language server, and changing `enabled` starts or stops it. `intel.dn42.enabled` has `application` scope and reads only user settings. `serverPath`, `trace.server`, and `validation.command` have `machine-overridable` scope, `performance.startupTimeoutMs` has `window` scope, and the remaining settings have `resource` scope, so they can differ per workspace folder. The extension also sets `editor.defaultFormatter` to `BIRDCC.bird2-lsp` for the `bird2` language.

## Commands

| Command                         | ID                                 | Action                                                                                                                      |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| BIRD2: Restart Language Server  | `bird2-lsp.restartLanguageServer`  | Stop and start the language server.                                                                                         |
| BIRD2: Enable Language Server   | `bird2-lsp.enableLanguageServer`   | Set `bird2-lsp.enabled` to `true` in the settings of the active file's workspace folder, else the workspace, else the user. |
| BIRD2: Disable Language Server  | `bird2-lsp.disableLanguageServer`  | Set `bird2-lsp.enabled` to `false` in the same settings target.                                                             |
| BIRD2: Validate Active Document | `bird2-lsp.validateActiveDocument` | Run fallback validation on the active file. An unsaved file is saved first after confirmation.                              |
| BIRD2: Format Active Document   | `bird2-lsp.formatActiveDocument`   | Run Format Document.                                                                                                        |
| BIRD2: Open Extension Settings  | `bird2-lsp.openSettings`           | Open the Settings editor filtered to this extension.                                                                        |
| BIRD2: Show Output Channel      | `bird2-lsp.showOutputChannel`      | Show the `BIRD2 LSP` output channel.                                                                                        |
| BIRD2: Open Documentation       | `bird2-lsp.showDocumentation`      | Open the extension's package page on GitHub.                                                                                |
| BIRD2: Reload Configuration     | `bird2-lsp.reloadConfiguration`    | Read the extension settings again.                                                                                          |

Validate Active Document and Format Active Document appear in the editor context menu of `bird2` files and are hidden from the Command Palette for other files.

## Snippets

The extension contributes 40 snippets for the `bird2` language. Each snippet has a `bird-*` prefix and shorter aliases such as `bgp`, `ospf`, `filter`, and `if`.

| Group             | Count | Prefixes                                                                                                                                                                                                                                                                                                    |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global statements | 7     | `bird-dir-router-id`, `bird-dir-include`, `bird-var-define`, `bird-dir-log`, `bird-dir-timebase`, `bird-dir-graceful-restart`, `bird-dir-watchdog`                                                                                                                                                          |
| Protocols         | 14    | `bird-proto-tmpl`, `bird-proto-from-tmpl`, `bird-proto-device`, `bird-proto-kernel`, `bird-proto-static`, `bird-proto-direct`, `bird-proto-pipe`, `bird-proto-bgp`, `bird-proto-bgp-full`, `bird-proto-bgp-rr-client`, `bird-proto-bgp-confed`, `bird-proto-ospf`, `bird-proto-ospf-area`, `bird-proto-rip` |
| Filters           | 8     | `bird-filter-simple`, `bird-filter-block`, `bird-filter-prefix`, `bird-filter-case`, `bird-filter-community`, `bird-filter-as-path`, `bird-filter-rpki`, `bird-filter-large-community`                                                                                                                      |
| Functions         | 5     | `bird-func`, `bird-func-prepend`, `bird-func-community`, `bird-func-net-match`, `bird-func-metric`                                                                                                                                                                                                          |
| Sets              | 3     | `bird-set-prefix`, `bird-set-community`, `bird-set-aspath`                                                                                                                                                                                                                                                  |
| Control flow      | 3     | `bird-flow-if`, `bird-flow-case`, `bird-flow-for`                                                                                                                                                                                                                                                           |

## Fallback validation

Fallback validation runs `bird2-lsp.validation.command` on saved files and shows the output as diagnostics with the source `bird -p`. It runs in these cases:

- The language server is disabled with `bird2-lsp.enabled: false`, globally or for the file.
- The language server failed to start within `bird2-lsp.performance.startupTimeoutMs` or stopped with an error.
- **BIRD2: Validate Active Document** runs it on demand, also while the language server is running.

In the first two cases, the active file is validated when fallback validation starts, and other files 800 ms after they are opened, or after they are saved while `bird2-lsp.validation.onSave` is `true`. Editing a file clears its fallback diagnostics until the next save.

The command runs without a shell and only when the workspace is trusted and the file is saved, inside a workspace folder when one is open, within `bird2-lsp.performance.maxFileSizeBytes`, and accepted by the file association rules. On macOS and Linux, files writable by all users are skipped. The command template must contain `{file}` as a separate argument and must not contain shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `<`, `>`), `${env:...}` or `%VAR%` expansion, or start with a shell such as `bash`, `sh`, `cmd`, or `powershell`. A command other than the default needs confirmation once per session. The full rules are in [Configuration Guide](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/configuration.md#validation-command-safety).

## Project configuration

The language server reads `bird.config.json`, found by walking up from each file, and applies `main`, `workspaces`, `includePaths`, `crossFile`, `linter`, and `formatter`. `birdcc.config.json` is read as an alias. `linter.withBird`, `bird.validateCommand`, and `bird.binaryPath` configure the `bird -p` check of `birdcc lint` and do not affect the extension, which uses `bird2-lsp.validation.command`. Without a project file, the server detects an entry file in the workspace folder and analyzes the `include` graph from it. The server reports the detected entry in a notification. When it finds several entry files or only a low-confidence candidate, the notification suggests running `birdcc init` from [`@birdcc/cli`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli), which writes the file. The format is described in [docs/spec.md](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/spec.md).

## Feedback

- Bug reports: [open a bug report](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=bug-report.yml). Include the extension version and the log from **BIRD2: Show Output Channel**.
- Feature requests: [open a feature request](https://github.com/bird-chinese-community/BIRD-LSP/issues/new?template=feature-request.yml).
- Known problems and fixes: [FAQ](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/faq.md). Error notifications from the extension link to the matching FAQ entry.

## See also

- [BIRD2 Extension Pack](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack) and [BIRD2 Configuration](https://marketplace.visualstudio.com/items?itemName=BIRDCC.vscode-bird2-conf) for syntax highlighting
- [`@birdcc/lsp`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/lsp) for using the language server in other editors
- [`@birdcc/cli`](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/cli) for linting and formatting in CI
- [Architecture](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/docs/architecture.md#vs-code-extension) for how the extension starts the server and where each feature runs

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

## Acknowledgements

<!-- prettier-ignore-start -->

<!-- CI START -->
We gratefully acknowledge these upstream repositories for the real-world BIRD configuration examples that help validate parsing, formatting, linting, and editor support in this project:

- [`PoemaIX/IX-BIRD-RS-Generator`](https://github.com/PoemaIX/IX-BIRD-RS-Generator)
- [`HuJK-Data/JKNET-BIRD`](https://github.com/HuJK-Data/JKNET-BIRD)
- [`@LaunchPad-Network`](https://github.com/LaunchPad-Network) *(private feed)*
- [`186526/net186-config`](https://github.com/186526/net186-config)
- [`SunyzNET/bird-config`](https://github.com/SunyzNET/bird-config)
- [`tianshome/bird-configs-output`](https://github.com/tianshome/bird-configs-output)
<!-- CI END -->

<!-- prettier-ignore-end -->
