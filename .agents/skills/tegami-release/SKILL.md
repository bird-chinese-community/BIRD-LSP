---
name: tegami-release
description: Record changesets, inspect Tegami version plans, review Version Packages PRs, and verify npm and VSIX releases in BIRD-LSP. Includes the ten workspace packages and the non-publishing Rust formatter crate.
---

# Tegami Releases

Read `docs/releasing.md` and the current `tools/tegami-config.mjs` before preparing a release. Use Node.js 24 or newer and the package manager pinned by the repository.

Run installation, builds, tests, lint, type checks, formatter checks, and version validation on an authorized remote host or GitHub Actions. Keep local operations to Git and text editing.

## Changesets and version plans

1. Preserve pre-existing changes with an isolated checkout.
2. Add `.tegami/*.md` entries for the actual affected packages. Include a non-empty `packages` mapping, a Markdown heading, and original implementation PR and Issue links.
3. Run `pnpm release:status` for a read-only version plan. Append `--expect-version VERSION` when verifying a coordinated release target.
4. Run `pnpm release:version` in a dedicated checkout to inspect the native manifest, dependency, changelog, lockfile, and publish-lock changes.
5. Validate the changed code and release tooling remotely. Keep package versions, artifacts, and changelogs bound to their tested commit.
6. Submit and review the integration and Version Packages PRs using the repository's signing, current-head checks, and merge-window rules.

## Publishing policy

- Eight public npm packages can publish to npm.
- `@birdcc/vscode` and `bird2-extension-pack` remain private npm packages; their versions and changelogs feed the VSIX workflow.
- Cargo `dprint-plugin-bird` remains `publish = false`; its version is embedded in the bundled WASM.
- The npm and Cargo formatter units share one changelog through the configured release hook.
- Unimplemented Issues remain in their original state. Release notes describe completed behavior.

## Verification

After the version PR merges, follow the Release and VS Code publishing workflows to completion. Verify each intended npm version and dist-tag with `npm view`, then read Marketplace verification and GitHub artifact results.

`tegami ci` can publish when no changesets are pending. Use `release:status` for a read-only inspection. `release:version` applies its draft, and `tegami publish` uses the publish lock. Keep publish-lock retries bound to the intended versions and existing registry releases.
