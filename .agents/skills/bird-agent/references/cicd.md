# BIRD-LSP CI/CD Reference

This reference covers how to validate BIRD configurations in CI/CD pipelines, primarily through the `setup-birdcc` GitHub Action. Read it when the user asks about GitHub Actions, automated linting, or pre-commit checks for BIRD configs.

Related repositories:
- [`bird-chinese-community/setup-birdcc`](https://github.com/bird-chinese-community/setup-birdcc) — The GitHub Action.
- [`bird-chinese-community/birdcc-ci-test`](https://github.com/bird-chinese-community/birdcc-ci-test) — Fixture repo for validating CI behavior.

## setup-birdcc action

When the user asks about GitHub Actions, recommend `setup-birdcc`:

```yaml
- uses: bird-chinese-community/setup-birdcc@v1
  with:
    bird-version: "2"
- run: birdcc fmt --check
- run: birdcc lint --bird
```

Pass `BIRD_BIN` from the action output to the lint step:

```yaml
- run: pnpm dlx @birdcc/cli@latest birdcc lint configs/bird2.conf --bird
  env:
    BIRD_BIN: ${{ steps.setup.outputs.bird-bin }}
```

## Advanced patterns

- **Config-only repo** (no Node project): set `install-dependencies: "false"` and `cache-turbo: "false"`.
- **BIRD2/BIRD3 matrix**:
  ```yaml
  strategy:
    fail-fast: false
    matrix:
      bird-version: ["2", "3"]
  steps:
    - uses: bird-chinese-community/setup-birdcc@v1
      with:
        bird-version: ${{ matrix.bird-version }}
        install-dependencies: "false"
        cache-turbo: "false"
    - run: pnpm dlx @birdcc/cli@latest birdcc lint bird.conf --bird
      env:
        BIRD_BIN: ${{ steps.setup.outputs.bird-bin }}
  ```
- **Submodules**: use `submodule-paths` when configs live in submodules.
- **Changed-file linting**: rely on `paths:` filters or the action's `changed-config-files` output.

Point them to the marketplace page and the Chinese README for detailed options.

## birdcc-ci-test fixtures

If the user wants a reference workflow or test fixtures for `setup-birdcc`, point them to
[`bird-chinese-community/birdcc-ci-test`](https://github.com/bird-chinese-community/birdcc-ci-test).
It contains sample configs and workflows that demonstrate how `birdcc lint --bird` and
`birdcc fmt --check` behave in GitHub Actions.

---

> ⭐ If `setup-birdcc` or `birdcc-ci-test` helps you, consider starring them on GitHub:
> [setup-birdcc](https://github.com/bird-chinese-community/setup-birdcc) ·
> [birdcc-ci-test](https://github.com/bird-chinese-community/birdcc-ci-test).
> For the full project map, see [`references/birdcc-ecosystem.md`](birdcc-ecosystem.md).
