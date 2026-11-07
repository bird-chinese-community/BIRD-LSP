<div align="center">

<img src="https://raw.githubusercontent.com/bird-chinese-community/BIRD-LSP/main/packages/@birdcc/vscode-pack/assets/icon-256.png" width="96" height="96" alt="BIRD2 Extension Pack" />

# BIRD2 Extension Pack

VS Code extension pack that installs the BIRD2 language server extension and the BIRD2 syntax highlighting extension.

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/BIRDCC.bird2-extension-pack.svg?label=VS%20Marketplace&color=007ACC&style=flat-square)](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack)
[![Open VSX](https://img.shields.io/open-vsx/v/BIRDCC/bird2-extension-pack?style=flat-square&label=Open%20VSX&color=C160EF)](https://open-vsx.org/extension/BIRDCC/bird2-extension-pack)
[![License](https://img.shields.io/badge/license-GPL--3.0--only-green.svg?style=flat-square)](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)

</div>

BIRD2 Extension Pack contains no code of its own. Installing it installs two extensions for BIRD 2 and BIRD 3 configuration files, and both register the `bird2` language for `.conf`, `.bird`, `.bird2`, `.bird3`, `.bird2.conf`, and `.bird3.conf` files.

| Extension                                                                                           | ID                         | Provides                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [BIRD2 LSP](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-lsp)                   | `BIRDCC.bird2-lsp`         | Bundled language server: diagnostics, completion, hover, navigation, formatting, inlay hints, snippets, `bird -p` fallback validation |
| [BIRD2 Configuration](https://marketplace.visualstudio.com/items?itemName=BIRDCC.vscode-bird2-conf) | `BIRDCC.vscode-bird2-conf` | TextMate grammar for syntax highlighting                                                                                              |

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=BIRDCC.bird2-extension-pack) by searching for `BIRD2 Extension Pack` in the Extensions view, or from a terminal:

```bash
code --install-extension BIRDCC.bird2-extension-pack
```

VSCodium and other editors that use Open VSX can install [BIRDCC/bird2-extension-pack](https://open-vsx.org/extension/BIRDCC/bird2-extension-pack).

Releases tagged `bird2-lsp-v<version>` on [GitHub Releases](https://github.com/bird-chinese-community/BIRD-LSP/releases) include `bird2-extension-pack.vsix`. The pack lists its members by ID, so installing the file still downloads both extensions from the editor's extension gallery (VS Code Marketplace or Open VSX):

```bash
code --install-extension bird2-extension-pack.vsix
```

## Requirements

VS Code 1.100 or newer. The requirements of each member, such as BIRD for `bird -p` validation, are listed in the [BIRD2 LSP README](https://github.com/bird-chinese-community/BIRD-LSP/tree/main/packages/@birdcc/vscode).

## License

[GPL-3.0-only](https://github.com/bird-chinese-community/BIRD-LSP/blob/main/LICENSE)
