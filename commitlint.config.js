module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        'config',
        'audit',
        'remediation',
      ],
    ],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'footer-max-line-length': [2, 'always', 100],
  },
  prompt: {
    questions: {
      type: {
        description: "Select the type of change you're committing",
        enum: {
          build: {
            description: 'Affects the build system or external dependencies',
            title: 'Build',
          },
          chore: {
            description: 'Other changes that do not modify src or test files',
            title: 'Chore',
          },
          ci: {
            description: 'Changes to CI configuration files and scripts',
            title: 'CI',
          },
          docs: {
            description: 'Documentation only changes',
            title: 'Docs',
          },
          feat: {
            description: 'A new feature',
            title: 'Feat',
          },
          fix: {
            description: 'A bug fix',
            title: 'Fix',
          },
          perf: {
            description: 'A code change that improves performance',
            title: 'Perf',
          },
          refactor: {
            description: 'A code change that neither fixes a bug nor adds a feature',
            title: 'Refactor',
          },
          revert: {
            description: 'Reverts a previous commit',
            title: 'Revert',
          },
          style: {
            description: 'Changes that do not affect the meaning of the code',
            title: 'Style',
          },
          test: {
            description: 'Adding missing tests or correcting existing tests',
            title: 'Test',
          },
          config: {
            description: 'Configuration changes for tools and linters',
            title: 'Config',
          },
          audit: {
            description: 'Audit-related changes and reports',
            title: 'Audit',
          },
          remediation: {
            description: 'Code quality remediation and cleanup',
            title: 'Remediation',
          },
        },
      },
      scope: {
        description: 'What is the scope of this change (e.g., component or file name)',
      },
      subject: {
        description: 'Write a short, imperative tense description of the change',
      },
      body: {
        description: 'Provide a longer description of the change',
      },
      isBreaking: {
        description: 'Are there any breaking changes?',
      },
      breakingBody: {
        description: 'A BREAKING CHANGE commit requires a body',
      },
      breaking: {
        description: 'Describe the breaking changes',
      },
      isIssueAffected: {
        description: 'Does this change affect any open issues?',
      },
      issuesBody: {
        description: 'An issue affected commit requires a body',
      },
      issues: {
        description: 'Add issue references (e.g., "fix #123", "re #123")',
      },
    },
  },
};
