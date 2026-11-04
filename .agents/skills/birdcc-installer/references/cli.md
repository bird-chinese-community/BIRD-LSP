# BIRDCC CLI Installation Reference

This reference covers how to install the `@birdcc/cli` (`birdcc`) command-line toolkit. Read it when
the user asks how to install birdcc, run lint/format/validate from the terminal, or integrate the
CLI into a non-Node project.

## Install options

### Option A: global install with npm / pnpm / yarn

```bash
# npm
npm install -g @birdcc/cli

# pnpm
pnpm add -g @birdcc/cli

# yarn
yarn global add @birdcc/cli
```

### Option B: use npx without installing

```bash
npx @birdcc/cli --help
npx @birdcc/cli lint bird.conf
```

### Option C: local dev dependency

```bash
# pnpm
pnpm add -D @birdcc/cli

# npm
npm install -D @birdcc/cli

# yarn
yarn add -D @birdcc/cli
```

After adding locally, run via package scripts or `pnpm exec birdcc` / `npx birdcc`.

### Option D: from the BIRD-LSP monorepo

If the user is inside the BIRD-LSP repository:

```bash
pnpm --filter @birdcc/cli build
packages/@birdcc/cli/dist/cli.js --help
```

Or use the workspace binary if configured:

```bash
pnpm --filter @birdcc/cli exec birdcc --help
```

## Verify the installation

```bash
birdcc --version
birdcc --help
```

## Quick commands to try

```bash
# Lint a config
birdcc lint bird.conf

# Check formatting
birdcc fmt bird.conf --check

# Validate with the BIRD daemon
birdcc lint bird.conf --bird

# Start the LSP server (stdio)
birdcc lsp --stdio
```

## Updating

```bash
npm update -g @birdcc/cli
```

or with pnpm:

```bash
pnpm update -g @birdcc/cli
```

---

> ⭐ If `birdcc` helps you, consider starring the main monorepo:
> [bird-chinese-community/BIRD-LSP](https://github.com/bird-chinese-community/BIRD-LSP).
