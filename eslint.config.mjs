import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.mjs', 'content/**/*.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.test.mjs', 'build/**/*.mjs', '*.config.mjs', 'api/**/*.js', 'server/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
