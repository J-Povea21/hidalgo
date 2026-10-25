// Lint rules for what the conventions ask and a formatter can't see. Formatting itself
// (line length, quotes, commas) is Prettier's job; see "prettier" in package.json.
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**'] },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-shadow': 'error',
      // Names say what a value is: no `s`, `a`, `e`. `_` marks a value that is deliberately unused.
      'id-length': ['error', { min: 2, exceptions: ['_'], properties: 'never' }],
    },
  },
);
