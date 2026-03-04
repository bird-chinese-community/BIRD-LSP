import { defineConfig } from 'bumpp'

export default defineConfig({
  // Enable recursive bumping for monorepo
  recursive: true,

  // Files to bump version in
  files: [
    'package.json',
    'packages/@birdcc/*/package.json',
  ],

  // Use conventional commits
  commit: {
    message: 'chore(release): v{{version}}',
  },

  // Create git tag
  tag: {
    name: 'v{{version}}',
  },

  // Push to remote
  push: true,

  // Confirmation before bumping
  confirm: true,

  // Execute function before committing (optional)
  // execute: (config) => {
  //   console.log('Bumping version to:', config.version)
  // },

  // Custom version manipulation (optional)
  // preid: 'alpha', // Use 'alpha' as pre-release identifier
})
