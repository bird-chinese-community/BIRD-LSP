# Changelog

All notable changes to `@birdcc/vscode` will be documented in this file.

## [0.1.2]

### Added

- Register `DocumentRangeFormattingEditProvider` so **Format Selection** is available for BIRD2 files.
- Add editor context-menu entries for `BIRD2: Validate Active Document` and `BIRD2: Format Active Document`.
- Add keyword hover documentation provider backed by YAML data.
- Add fallback validation trigger on `onDidChangeTextDocument` for real-time diagnostics in fallback mode.

### Changed

- Harden status-bar lifecycle initialization to avoid unsafe early access patterns.
- Switch hover docs to shared YAML synchronization workflow via `sync:hover-docs`.

## [0.1.1]

### Changed

- Add marketplace `icon` metadata so extension icon is displayed in VS Code Marketplace and OpenVSX.
- Prevent nested VSIX artifacts by cleaning stale `dist/bird2-lsp.vsix` before packaging.

## [0.1.0]

### Changed

- First marketplace track release from the monorepo package.
- Align versioning with VS Code Marketplace requirements for pre-release publishing.
- Publish this version to both OpenVSX and VS Code Marketplace with pre-release channel enabled.

## [0.0.1-alpha.0]

### Added

- Initial VS Code extension scaffold and activation lifecycle.
- Fallback validation command hardening and workspace trust checks.
- Large-file guards for expensive extension-side features.
- Real-world performance and smoke-test integration support.
- Initial unit-testing foundation with Vitest (`test` script + config + security/config parser tests).
- Package-level README and configuration guide.
