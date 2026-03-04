# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to track version bumps and generate changelogs.

## How to add a changeset

When you make a change that should be noted in the changelog:

```bash
pnpm changeset
```

This will prompt you to:

1. Select which packages have changed
2. Choose bump type (major/minor/patch)
3. Write a summary of the change

The changeset file will be committed with your PR.

## Release process

1. Changesets bot opens a "Version Packages" PR when changesets accumulate
2. The PR updates `package.json` versions and `CHANGELOG.md` files
3. When merged, the release workflow publishes to npm and creates GitHub Releases
