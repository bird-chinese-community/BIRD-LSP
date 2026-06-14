module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    // Auto-generated historical config-examples sync commits use lowercase subject.
    // The sync script has been fixed on main; ignore the old commits to unblock CI.
    (commit) => commit.includes('update config examples [skip ci]'),
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
        'revert',
        'build',
        'ci'
      ]
    ],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 200],
    'subject-case': [2, 'always', 'sentence-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-empty': [2, 'never'],
    'scope-case': [2, 'always', 'kebab-case']
  }
};
