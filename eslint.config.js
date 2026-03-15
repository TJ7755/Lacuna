import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';

// ---------------------------------------------------------------------------
// Custom inline plugin: no-emoji
//
// Raises an error if emoji codepoints are found anywhere in the source text.
// Ranges covered:
//   U+2600–U+27FF  (Miscellaneous Symbols, Dingbats, etc.)
//   U+1F000–U+1FFFF (Mahjong, Symbols, Emoticons, Pictographs, etc.)
//   U+1FA00–U+1FAFF (Symbols and Pictographs Extended-A)
//
// User-generated card content is not affected — it is stored as runtime data,
// not embedded in source files.
// ---------------------------------------------------------------------------

const EMOJI_RE = /[\u{2600}-\u{27FF}\u{1F000}-\u{1FFFF}\u{1FA00}-\u{1FAFF}]/u;

const noEmojiPlugin = {
  rules: {
    'no-emoji': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow Unicode emoji codepoints in source files (see DESIGN.md §7).',
        },
        schema: [],
        messages: {
          foundEmoji:
            'Emoji characters are not permitted in source files. See DESIGN.md §7.',
        },
      },
      create(context) {
        return {
          Program() {
            const src = context.getSourceCode
              ? context.getSourceCode().getText()
              : context.sourceCode.getText();
            const re = new RegExp(EMOJI_RE.source, 'gu');
            const match = re.exec(src);
            if (match) {
              const sourceCode = context.getSourceCode
                ? context.getSourceCode()
                : context.sourceCode;
              context.report({
                loc: sourceCode.getLocFromIndex(match.index),
                messageId: 'foundEmoji',
              });
            }
          },
        };
      },
    },
  },
};

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'src/db/migrations/**']),

  // TypeScript + React source
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      react: reactPlugin,
      'no-emoji-plugin': noEmojiPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-emoji-plugin/no-emoji': 'error',
    },
  },

  // Prettier formatting rules (must be last)
  prettierConfig,
]);
