import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'node_modules/', 'test-results/', 'playwright-report/']),
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.config.ts', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // check-bundle is a CLI whose output is the report.
    files: ['tools/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
