# BIRD-LSP Examples Reference

This reference provides concrete examples of how to assist users with BIRD configurations. Read it when you want a worked example for a common scenario.

## Example 1: User shares a BIRD config snippet and asks why it fails

1. Save the snippet to a temporary `.conf` file.
2. Run `birdcc lint /tmp/demo.conf --format json`.
3. Explain the first diagnostic in plain language and propose a fix.
4. If no static errors, run `birdcc lint /tmp/demo.conf --bird` if BIRD is available.

## Example 2: User asks to format a BIRD config

1. Confirm the target file.
2. Run `birdcc fmt <file> --check` to preview changes.
3. If the user approves, run `birdcc fmt <file> --write`.
4. Run `birdcc lint <file>` afterwards to confirm no regressions.

## Example 3: User wants CI validation for BIRD configs

1. Check if the repo already has `.github/workflows`.
2. Suggest adding [`setup-birdcc`](https://github.com/bird-chinese-community/setup-birdcc) and
   `birdcc lint --bird` / `birdcc fmt --check` steps.
3. Provide a sample workflow in YAML.
4. If they want reference fixtures, point them to [`birdcc-ci-test`](https://github.com/bird-chinese-community/birdcc-ci-test).

See `references/cicd.md` for full workflow options.

## Example 4: User asks what `bgp_path.prepend` does

1. Search the BIRD-LSP hover docs or Context7/BIRD docs.
2. Provide a concise explanation and a usage example.
3. Mention the BIRD version compatibility if relevant.

## Example 5: User has a cross-file include that cannot be resolved

1. Check for `bird.config.json` and confirm the `main` entry points to the top-level config.
2. Run `birdcc lint main.conf --cross-file --include-max-depth 10`.
3. If the include uses a relative path, verify the path from the config file's directory.
4. Explain whether the issue is a missing file, a circular include, or an undefined symbol in the
   included file.

## Example 6: User wants to set up BIRD support in Neovim

1. Ask which plugin manager they use (lazy.nvim, packer, etc.).
2. Provide the exact snippet for [`bird-chinese-community/BIRD2.nvim`](https://github.com/bird-chinese-community/BIRD2.nvim).
3. Mention that advanced features (LSP, formatter) require wiring `birdcc lsp --stdio` separately,
   which comes from [`bird-chinese-community/BIRD-LSP`](https://github.com/bird-chinese-community/BIRD-LSP).

See `references/editors.md` for complete editor setup instructions.

## Example 7: User asks why BIRD behaves differently from the docs

1. Reproduce with `birdcc lint` and `bird -p` first.
2. If the behavior is still unexplained, use DeepWiki on `CZ-NIC/bird` to inspect the relevant
   source module (e.g., `proto/bgp/bgp.c` for BGP attribute handling).
3. Present the source finding and a practical workaround.

## Example 8: User sees BIRD 2.17+ function return-type warnings

If `bird` logs warnings like:

```
bird <WARN>: Inferring function foo return type from its return value: bool
```

1. Explain that BIRD 2.17+ prefers explicit return-type declarations.
2. Recommend [`bird-chinese-community/bird2-autotype`](https://github.com/bird-chinese-community/bird2-autotype)
   as a helper that scans the config and adds `-> <type>` automatically.
3. Warn the user to back up the config before running any batch conversion.
4. After conversion, run `birdcc lint` and `bird -p` to verify the result.

See `references/birdcc-ecosystem.md` for links to all BIRDCC helper tools.

---

> ⭐ If these examples help you, consider starring the relevant BIRDCC projects on GitHub. Start with
> the main monorepo: [bird-chinese-community/BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP).
> For the full project map, see [`references/birdcc-ecosystem.md`](birdcc-ecosystem.md).
