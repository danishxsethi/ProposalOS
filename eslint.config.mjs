import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importPlugin from 'eslint-plugin-import';

const importOrderRule = [
  'error',
  {
    groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'type'],
    pathGroups: [
      {
        pattern: 'react',
        group: 'builtin',
        position: 'before',
      },
      {
        pattern: 'next/**',
        group: 'external',
        position: 'before',
      },
      {
        pattern: '@/**',
        group: 'internal',
        position: 'after',
      },
      {
        pattern: '@shared/**',
        group: 'internal',
        position: 'after',
      },
    ],
    pathGroupsExcludedImportTypes: ['builtin'],
    'newlines-between': 'always',
    alphabetize: {
      order: 'asc',
      caseInsensitive: true,
    },
  },
];

const baseRules = {
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  complexity: ['warn', { max: 15 }],
  'import/order': importOrderRule,
  'sort-imports': [
    'warn',
    {
      ignoreCase: true,
      ignoreDeclarationSort: true,
    },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  'react/no-unescaped-entities': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/set-state-in-effect': 'warn',
  '@next/next/no-html-link-for-pages': 'warn',
  '@typescript-eslint/no-require-imports': 'warn',
  'prefer-const': 'warn',
  '@typescript-eslint/no-unsafe-function-type': 'warn',
  '@typescript-eslint/no-empty-object-type': 'warn',
  '@typescript-eslint/ban-ts-comment': 'warn',
};

export default [
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: baseRules,
  },
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/__tests__/**'],
    rules: {
      'no-console': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-console': 'off',
      complexity: 'off',
      'import/order': 'off',
      'sort-imports': 'off',
    },
  },
  {
    files: ['prisma/**/*.ts'],
    rules: {
      'no-console': 'off',
      'import/order': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      'no-console': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
    },
  },
  {
    files: ['app/api/**/*.ts', 'app/api/**/*.tsx'],
    rules: {
      // no-console intentionally NOT overridden here — base rule applies:
      // only console.warn / console.error / console.info are allowed.
      complexity: ['warn', { max: 30 }],
    },
  },
  {
    files: ['app/(dashboard)/**/*.tsx', 'app/(admin)/**/*.tsx'],
    rules: {
      complexity: ['warn', { max: 20 }],
    },
  },
  {
    files: ['lib/**/*.ts', 'lib/**/*.tsx'],
    rules: {
      // no-console intentionally NOT overridden here — base rule applies:
      // only console.warn / console.error / console.info are allowed.
      complexity: ['warn', { max: 45 }],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
    },
    rules: {
      'no-console': 'off',
      '@next/next/no-assign-module-variable': 'off',
    },
  },
  {
    files: ['app/(marketing)/**/*.tsx', 'app/(client)/**/*.tsx'],
    rules: {
      complexity: ['warn', { max: 20 }],
    },
  },
];
