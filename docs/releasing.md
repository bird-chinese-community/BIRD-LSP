# Releases and changesets

Tegami manages pending changesets, package versions, changelogs, and npm releases. Use Node.js 24 or newer and the pnpm version declared in the root `package.json`.

## Record a change

Run `pnpm tegami` or add a Markdown file under `.tegami/`:

```markdown
---
packages:
  "@birdcc/lsp": patch
---

## Apply project settings to diagnostics

Describe the resulting behavior and any required migration.

PR: https://github.com/bird-chinese-community/BIRD-LSP/pull/NUMBER
Issue: https://github.com/bird-chinese-community/BIRD-LSP/issues/NUMBER
```

Replace `NUMBER` with the original reference. Keep explicit links when moving an existing change entry: a later migration commit can have a different associated PR.

Each changeset needs a non-empty `packages` mapping and at least one Markdown heading. Select `patch`, `minor`, or `major` for each affected package. The package names are the names in their manifests; `npm:<name>` and `cargo:<name>` select a specific provider. Changes to the native formatter can affect both `@birdcc/dprint-plugin-bird` and `dprint-plugin-bird`.

Include a changeset for user-facing fixes, features, dependency updates, or release and maintenance changes that belong in a package changelog. Link the implementation PR and its related Issues. Track proposed work in its Issue until the implementation is ready for release.

## Inspect the release plan

```bash
pnpm release:status
```

This command reads pending changesets and prints the package versions, intended versions, publishing policy, and contributing files. It does not apply the draft or publish packages.

For the first stable release, validate the exact target:

```bash
pnpm release:status --expect-version 1.0.0
```

The 1.0.0 plan includes ten npm workspace packages and one Cargo release unit. Eight npm packages are published to npm. The private VS Code packages are versioned for their VSIX artifacts, and the non-publishing Cargo crate supplies the WASM bundled in the npm formatter package.

## Apply and publish versions

On main, the Release workflow runs Tegami with the GitHub integration enabled. Pending changesets produce a Version Packages PR with manifest versions, dependency ranges, changelogs, lockfiles, and `.tegami/publish-lock.yaml`.

Review that PR and its checks before merging. The subsequent Release run publishes the npm packages recorded in the publish lock. The VS Code workflow packages and publishes the versioned VSIX artifacts through its existing registries.

`pnpm release:version` applies a draft in the current checkout and consumes its pending changesets. Use a dedicated checkout when inspecting the generated files. `pnpm tegami publish` publishes from the committed publish lock; its execution belongs in the authenticated release workflow.

The formatter's npm and Cargo units share one changelog. Their versions and publish-lock entries remain distinct, while the release hook combines their change entries into that shared file.

## PR and Issue tracking

PR release previews show the proposed package changes. Complete the PR template with the changeset path and original Issue links. Bug reports and feature requests can record an existing implementation PR or changeset in their release-tracking field.

The 1.0.0 entries retain links to the eighteen reliability and maintenance PRs and the forty-six resolved audit Issues. The remaining dependency migrations, environment matrix work, and feature suggestions continue in their existing Issues.
