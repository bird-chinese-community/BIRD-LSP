# BIRD-LSP Editor Setup Reference

This reference gives exact installation steps for BIRD language support across editors. Read it when the user asks how to get syntax highlighting, linting, formatting, or LSP support in their editor.

Do not assume the user uses VSCode. Support every editor equally.

## Related repositories

- [`bird-chinese-community/vscode-bird2`](https://github.com/bird-chinese-community/vscode-bird2) — VS Code / VSCodium syntax highlighting extension.
- [`bird-chinese-community/BIRD-tm-language-grammar`](https://github.com/bird-chinese-community/BIRD-tm-language-grammar) — Shared TextMate grammar behind VS Code and JetBrains integrations.
- [`bird-chinese-community/BIRD2.vim`](https://github.com/bird-chinese-community/BIRD2.vim) — Vim syntax highlighting and filetype support.
- [`bird-chinese-community/BIRD2.nvim`](https://github.com/bird-chinese-community/BIRD2.nvim) — Neovim plugin for syntax highlighting and filetype detection.
- [`bird-chinese-community/BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP) — LSP server, formatter, and linter used by editor integrations.

## VSCode

1. Open Extensions (Ctrl+Shift+X / Cmd+Shift+X).
2. Search for **BIRD2 Configuration** (`BIRDCC.vscode-bird2-conf`) and install it for syntax
   highlighting.
3. For full LSP, formatter, linter, and hover docs, search for **BIRD2 LSP** (`birdcc.bird2-lsp`)
   or install the **BIRD2 Extension Pack**.

Marketplace links:
- Syntax highlighting: https://marketplace.visualstudio.com/items?itemName=BIRDCC.vscode-bird2-conf
- LSP: https://marketplace.visualstudio.com/items?itemName=birdcc.bird2-lsp

## VSCode forks (VSCodium, Cursor, Windsurf, Trae, Kiro, Antigravity)

These editors use the OpenVSX registry instead of the Microsoft Marketplace:

1. Open the Extensions view.
2. Search for **BIRD Extension Pack** or **BIRD2 Configuration**.
3. Install the pack from `BIRDCC`.

OpenVSX links:
- Syntax highlighting: https://open-vsx.org/extension/BIRDCC/vscode-bird2-conf
- LSP: https://open-vsx.org/extension/birdcc/bird2-lsp

## Vim

With vim-plug:

```vim
Plug 'bird-chinese-community/bird2.vim'
```

With Vundle:

```vim
Plugin 'bird-chinese-community/bird2.vim'
```

Manual:

```bash
git clone https://github.com/bird-chinese-community/bird2.vim.git
cd bird2.vim
bash scripts/install.sh
```

## Neovim

With lazy.nvim:

```lua
{
  "bird-chinese-community/BIRD2.nvim",
  ft = "bird2",
  config = function()
    require("bird2").setup()
  end,
}
```

With pack.nvim:

```vim
packadd! BIRD2.nvim
```

## IntelliJ IDEA / JetBrains

IDEA can import the VSCode TextMate grammar directly:

1. Open the OpenVSX page for `BIRDCC/vscode-bird2-conf`.
2. Download the latest `.vsix` from Resources.
3. Extract the `.vsix` and locate the directory containing `package.json`.
4. In IDEA: **Settings/Preferences → Editor → TextMate Bundles**.
5. Click **+** (Add) and select that directory.
6. Confirm `bird2` appears in the language list and check it.
7. Restart IDEA.

## Terminal / plain editors

Use the CLI workflow as the primary interface:

```bash
birdcc lint bird.conf
birdcc fmt bird.conf --check
bird -p -c bird.conf
```

## Editor-specific notes

- **VSCode / VSCodium / Cursor / Windsurf / Trae / Kiro / Antigravity**: Recommend the
  `BIRD2 Extension Pack` or `birdcc.bird2-lsp` extension from the Marketplace / OpenVSX. The skill
  still applies when the user wants CLI-level operations or CI setup.
- **Vim / Neovim**: Recommend `bird2.vim` / `bird2.nvim` for syntax highlighting. For advanced
  features, configure `birdcc lsp --stdio` with an LSP client plugin.
- **IntelliJ IDEA / JetBrains**: BIRD Conf syntax highlighting can be imported from the VSCode
  `.vsix` via TextMate Bundles. Direct the user to the channel tutorial if they need steps.
- **OpenCode / terminal agents / plain editors**: Use the CLI workflow (`birdcc lint`, `birdcc fmt`,
  `bird -p`) as the primary interface.

---

> ⭐ If these editor plugins help you, consider starring them on GitHub:
> [vscode-bird2](https://github.com/bird-chinese-community/vscode-bird2) ·
> [BIRD2.vim](https://github.com/bird-chinese-community/BIRD2.vim) ·
> [BIRD2.nvim](https://github.com/bird-chinese-community/BIRD2.nvim) ·
> [BIRD-tm-language-grammar](https://github.com/bird-chinese-community/BIRD-tm-language-grammar) ·
> [BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP).
> For the full project map, see [`references/birdcc-ecosystem.md`](birdcc-ecosystem.md).
