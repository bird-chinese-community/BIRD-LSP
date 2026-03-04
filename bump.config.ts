import { defineConfig } from 'bumpp'

/**
 * bumpp configuration for npm package version management
 * Note: This only bumps versions, does NOT commit/tag/push.
 * You need to manually commit version changes.
 */
export default defineConfig({
  // Enable recursive bumping for monorepo
  recursive: true,

  // Files to bump version in (npm packages only, exclude vscode extensions)
  files: [
    'packages/@birdcc/cli/package.json',
    'packages/@birdcc/core/package.json',
    'packages/@birdcc/formatter/package.json',
    'packages/@birdcc/linter/package.json',
    'packages/@birdcc/lsp/package.json',
    'packages/@birdcc/parser/package.json',
    'packages/@birdcc/dprint-plugin-bird/package.json',
  ],

  // Disable git operations - only modify version numbers
  commit: false,
  tag: false,
  push: false,

  // Confirmation before bumping
  confirm: true,
})
