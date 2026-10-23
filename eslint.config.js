import js from '@eslint/js';
import { appImportsRule, relayImportsRule, trainingImportsRule } from './scripts/relay-imports.mjs';
import { domainUiRule } from './scripts/import-architecture.mjs';
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
      'electron/dist-electron/**',
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
    files: [
      'src/{db,fsrs,sync,ai,mcp,questions,state,course}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
    ],
    plugins: { architecture: { rules: { 'no-domain-ui': domainUiRule } } },
    rules: {
      'architecture/no-domain-ui': [
        'error',
        {
          // These integration tests deliberately exercise the UI projection of domain data.
          integrationTests: [
            {
              from: 'src/db/lessonPrerequisites.test.ts',
              to: 'src/components/import/mergeReviewRows.ts',
            },
            {
              from: 'src/db/sessionHistoryRead.test.ts',
              to: 'src/components/analytics/prepare.ts',
            },
          ],
        },
      ],
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
  {
    // Playwright page.evaluate callbacks and the WASI worker run in the browser.
    files: ['scripts/**/*.mjs', 'src/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.es2021 } },
  },
  {
    files: ['gaps/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Command-line tooling reports through the console by design.
    files: ['scripts/**', 'tooling/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: [
      '{src,server,electron,tests,api,scripts,tooling}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
      '*.config.ts',
    ],
    plugins: { 'relay-contract': { rules: { 'no-deep-imports': relayImportsRule } } },
    rules: {
      'relay-contract/no-deep-imports': [
        'error',
        {
          // Exact integration edges for in-process relay fixtures, never a general test waiver.
          integrationTests: [
            { from: 'src/insights/classKey.test.ts', to: 'relay/src/relay.ts' },
            { from: 'src/insights/classKey.test.ts', to: 'relay/src/store.ts' },
            { from: 'src/insights/classKey.test.ts', to: 'relay/src/channelMaintenance.ts' },
            { from: 'src/insights/mailbox.test.ts', to: 'relay/src/relay.ts' },
            { from: 'src/insights/mailbox.test.ts', to: 'relay/src/store.ts' },
            { from: 'src/insights/outbox.test.ts', to: 'relay/src/relay.ts' },
            { from: 'src/insights/outbox.test.ts', to: 'relay/src/store.ts' },
            { from: 'src/shareLinks/verifyOwner.test.ts', to: 'relay/src/relay.ts' },
            { from: 'src/shareLinks/verifyOwner.test.ts', to: 'relay/src/store.ts' },
            { from: 'src/teacher/connectionStore.test.ts', to: 'relay/src/relay.ts' },
            { from: 'src/teacher/connectionStore.test.ts', to: 'relay/src/store.ts' },
            { from: 'tests/e2e/fixtures/aiRelay.ts', to: 'relay/src/relay.ts' },
            { from: 'tests/e2e/fixtures/aiRelay.ts', to: 'relay/src/store.ts' },
            { from: 'tests/e2e/gaps-artefact-labels.spec.ts', to: 'relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-artefact-labels.spec.ts', to: 'relay/src/store.ts' },
            { from: 'tests/e2e/gaps-course-connection.spec.ts', to: 'relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-course-connection.spec.ts', to: 'relay/src/store.ts' },
            { from: 'tests/e2e/gaps-daily-flow.spec.ts', to: 'relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-daily-flow.spec.ts', to: 'relay/src/store.ts' },
            { from: 'tests/e2e/share-links.spec.ts', to: 'relay/src/relay.ts' },
            { from: 'tests/e2e/share-links.spec.ts', to: 'relay/src/store.ts' },
            { from: 'scripts/library-publish-cli.test.ts', to: 'relay/src/relay.ts' },
            { from: 'scripts/library-publish-cli.test.ts', to: 'relay/src/store.ts' },
            { from: 'scripts/library-publish.test.ts', to: 'relay/src/relay.ts' },
            { from: 'scripts/library-publish.test.ts', to: 'relay/src/store.ts' },
          ],
        },
      ],
    },
  },
  {
    files: ['{electron/mcp,api}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    plugins: { 'app-contract': { rules: { 'no-deep-imports': appImportsRule } } },
    rules: { 'app-contract/no-deep-imports': 'error' },
  },
  {
    files: ['{src,server,electron,api}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    plugins: { 'training-contract': { rules: { 'no-deep-imports': trainingImportsRule } } },
    rules: {
      'training-contract/no-deep-imports': ['error', {
        integrationTests: [
          { from: 'src/fsrs/halfLifeLogisticModel.test.ts', to: 'tooling/short-term-memory/coefficients/half-life-logistic-v1.json' },
          { from: 'src/fsrs/halfLifeLogisticModel.test.ts', to: 'tooling/short-term-memory/tests/fixtures/model-port-v3.json' },
        ],
      }],
    },
  },
  prettier,
];
