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
  'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
  complexity: ['error', { max: 15 }],
  'import/order': importOrderRule,
  'sort-imports': [
    'error',
    {
      ignoreCase: true,
      ignoreDeclarationSort: true,
    },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
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
      'no-console': 'off',
      complexity: ['error', { max: 30 }],
    },
  },
  {
    files: ['app/(dashboard)/**/*.tsx', 'app/(admin)/**/*.tsx'],
    rules: {
      complexity: ['error', { max: 20 }],
    },
  },
  {
    files: ['lib/**/*.ts', 'lib/**/*.tsx'],
    rules: {
      complexity: ['error', { max: 45 }],
      'no-console': 'off',
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
      complexity: ['error', { max: 20 }],
    },
  },
];
