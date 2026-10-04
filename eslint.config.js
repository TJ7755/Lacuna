import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier/flat';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { createRequire } from 'node:module';

// eslint-plugin-react 7.x's `version: 'detect'` calls context.getFilename(), which
// ESLint 10 removed. Pass the installed React version explicitly instead.
const { version: reactVersion } = createRequire(import.meta.url)('react/package.json');

const sharedRules = {
  eqeqeq: ['error', 'always'],
  'no-useless-assignment': 'off',
  'no-console': ['warn', { allow: ['error'] }],
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      // Separate packages with their own manifests and configs.
      'relay/**',
      'tooling/lacuna-ai-mcp/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: [
          './tsconfig.app.json',
          './tsconfig.node.json',
          './tsconfig.server.json',
          './tsconfig.release-tooling.json',
          './tsconfig.lint.json',
          './scripts/electron-performance/tsconfig.json',
          './electron/tsconfig.json',
          './electron/tsconfig.preload.json',
          './electron/tsconfig.mcp.json',
          './tooling/handwriting-maths/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tsPlugin, react, 'react-hooks': reactHooks },
    settings: { react: { version: reactVersion } },
    rules: {
      ...tsPlugin.configs['flat/eslint-recommended'].rules,
      ...tsPlugin.configs['flat/recommended'][2].rules,
      ...react.configs.flat.recommended.rules,
      ...sharedRules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  prettier,
];
