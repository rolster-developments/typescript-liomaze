import js from '@eslint/js';

import perfectionist from 'eslint-plugin-perfectionist';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.test.ts', '**/*.test.tsx']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      perfectionist
    },
    rules: {
      'comma-dangle': ['error', 'never'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'simple-import-sort/imports': [
        'warn',
        {
          groups: [['^@'], ['^\\w'], ['^\\.'], ['^\\u0000']]
        }
      ],
      'simple-import-sort/exports': 'error',
      'perfectionist/sort-interfaces': [
        'warn',
        {
          type: 'alphabetical',
          order: 'asc',
          groups: ['required-member', 'optional-member']
        }
      ]
    }
  }
);
