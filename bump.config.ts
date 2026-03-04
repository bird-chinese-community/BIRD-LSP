import { defineConfig } from 'bumpp'

export default defineConfig({
  // Enable recursive bumping for monorepo
  recursive: true,

  // Files to bump version in
  files: [
    'package.json',
    'packages/@birdcc/*/package.json',
  ],

  // Use conventional commits with proper format
  commit: 'chore(release): Release v%s',

  // Create git tag
  tag: 'v%s',

  // Push to remote
  push: true,

  // Confirmation before bumping
  confirm: true,
})
