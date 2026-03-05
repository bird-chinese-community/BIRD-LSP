---
name: bumpp-npm-versioning
description: Use this skill when bumping npm package versions in the BIRD-LSP monorepo with bumpp. Apply it for release preparation, prerelease increments, or package version synchronization while keeping @birdcc/vscode and @birdcc/intel unchanged.
---

# Bumpp Npm Versioning

## Overview

Use `bumpp` with repository config to update npm package versions consistently.
Avoid manual edits to `package.json` versions unless recovering from a failed bump run.

## Workflow

1. Check the current workspace status.

```bash
git status --short
```

2. Confirm bumpp scope from repository config.

```bash
cat bump.config.ts
```

3. Run bump with `alpha` prerelease sequence (no manual git operations from bumpp).

```bash
pnpm dlx bumpp --release prerelease --preid alpha --yes
```

4. Verify changed manifests and ensure excluded packages were not touched.

```bash
git diff -- packages/@birdcc/*/package.json
```

5. Build and test baseline before commit.

```bash
pnpm build
pnpm test
```

6. Commit version bump separately from feature changes.

## Required Checks

- Do not modify `packages/@birdcc/vscode/package.json`.
- Do not modify `packages/@birdcc/intel/package.json`.
- Ensure bump output only includes packages listed in `bump.config.ts`.
- Ensure git working tree was clean before running release bump, or clearly separate pre-existing changes.

## Publish Visibility Checks

Check whether `@birdcc/intel` is already on npm:

```bash
npm view @birdcc/intel version dist-tags --json
npm view @birdcc/intel versions --json
```

Check publish-related workflows and releases:

```bash
gh workflow list
gh run list --limit 50
gh release list --limit 20
```

## Common Pitfalls

- Running `bumpp` multiple times in one session can accidentally bump twice.
- Running ad-hoc bumpp commands that bypass `bump.config.ts` can break scope control.
- Interpreting `intel` publish status from GitHub release tags alone is unreliable; always confirm with `npm view`.
