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
      // A guard clause's body goes on its own line: `if (done) {\n return; }`, never `if (done) return;`.
      curly: ['error', 'all'],
      // A ternary is for a short either-or; anything longer is an if/else or a lookup.
      'no-nested-ternary': 'error',
      // No `x as T`: types come from declarations, parsers and type guards (`as const` stays allowed).
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      // Names say what a value is: no `s`, `a`, `e`. `_` marks a value that is deliberately unused.
      'id-length': ['error', { min: 2, exceptions: ['_'], properties: 'never' }],
    },
  },
);
