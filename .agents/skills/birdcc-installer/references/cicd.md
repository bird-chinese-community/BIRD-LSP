# BIRDCC CI/CD Installation Reference

This reference covers how to install and configure the `setup-birdcc` GitHub Action. Read it when
the user asks how to add BIRD config validation to GitHub Actions, how to install `birdcc` in CI, or
how to cache pnpm dependencies with `setup-birdcc`.

## What setup-birdcc installs

`setup-birdcc` is a GitHub Action that bootstraps the BIRDCC toolchain in CI:

- Node.js and pnpm (optional)
- `@birdcc/cli` (`birdcc`)
- BIRD v2 or BIRD v3 binary (optional, for `bird -p` validation)

Marketplace: search for `bird-chinese-community/setup-birdcc`.

Repository: https://github.com/bird-chinese-community/setup-birdcc

## Minimal workflow

```yaml
name: BIRD Config CI

on:
  push:
    paths:
      - '**.conf'
      - 'bird.config.json'
  pull_request:
    paths:
      - '**.conf'
      - 'bird.config.json'

jobs:
  birdcc:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bird-chinese-community/setup-birdcc@v1
        with:
          bird-version: "2"
      - run: birdcc fmt --check
      - run: birdcc lint --bird
        env:
          BIRD_BIN: ${{ steps.setup.outputs.bird-bin }}
```

## Caching pnpm dependencies

If your repository uses pnpm, `setup-birdcc` can set up pnpm caching. The exact input name depends
on the action version; check the action README for `cache-turbo` / `cache-pnpm` options. A typical
pattern:

```yaml
- uses: bird-chinese-community/setup-birdcc@v1
  with:
    bird-version: "2"
    cache-turbo: "true"
```

For config-only repositories that do not need Node dependencies:

```yaml
- uses: bird-chinese-community/setup-birdcc@v1
  with:
    bird-version: "2"
    install-dependencies: "false"
    cache-turbo: "false"
```

## BIRD2 / BIRD3 matrix

```yaml
strategy:
  fail-fast: false
  matrix:
    bird-version: ["2", "3"]
steps:
  - uses: actions/checkout@v4
  - uses: bird-chinese-community/setup-birdcc@v1
    with:
      bird-version: ${{ matrix.bird-version }}
      install-dependencies: "false"
      cache-turbo: "false"
  - run: birdcc lint bird.conf --bird
    env:
      BIRD_BIN: ${{ steps.setup.outputs.bird-bin }}
```

## Verifying CI setup

After committing the workflow, open a PR that touches a `.conf` file and confirm the action runs
successfully. If `birdcc lint --bird` fails, check that `BIRD_BIN` is exported and that the BIRD
version matches the config syntax.

---

> ⭐ If `setup-birdcc` helps your team, consider starring it on GitHub:
> [bird-chinese-community/setup-birdcc](https://github.com/bird-chinese-community/setup-birdcc).
