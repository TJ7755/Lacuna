import js from '@eslint/js';
import { appImportsRule, relayImportsRule, trainingImportsRule } from './scripts/relay-imports.mjs';
import { domainDirectories, domainUiRule } from './scripts/import-architecture.mjs';
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
      'apps/desktop/dist-electron/**',
      '**/node_modules/**',
      '**/.venv/**',
      // Separate packages with their own manifests and configs.
      'apps/relay/**',
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
          './apps/desktop/tsconfig.json',
          './apps/desktop/tsconfig.preload.json',
          './apps/desktop/tsconfig.mcp.json',
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
      `apps/web/src/{${domainDirectories.join(',')}}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}`,
      'packages/**/*.{ts,tsx}',
    ],
    plugins: { architecture: { rules: { 'no-domain-ui': domainUiRule } } },
    rules: {
      'architecture/no-domain-ui': [
        'error',
        {
          // These integration tests deliberately exercise the UI projection of domain data.
          integrationTests: [
            {
              from: 'apps/web/src/db/lessonPrerequisites.test.ts',
              to: 'apps/web/src/components/import/mergeReviewRows.ts',
            },
            {
              from: 'apps/web/src/db/sessionHistoryRead.test.ts',
              to: 'apps/web/src/components/analytics/prepare.ts',
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
    files: ['scripts/**/*.mjs', 'apps/web/src/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.es2021 } },
  },
  {
    files: ['apps/gaps/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Command-line tooling reports through the console by design.
    files: ['scripts/**', 'tooling/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: [
      '{apps/web/src,apps/ai/server,apps/desktop,tests,apps/ai/api,scripts,tooling}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
      '*.config.ts',
    ],
    plugins: { 'relay-contract': { rules: { 'no-deep-imports': relayImportsRule } } },
    rules: {
      'relay-contract/no-deep-imports': [
        'error',
        {
          // Exact integration edges for in-process relay fixtures, never a general test waiver.
          integrationTests: [
            { from: 'apps/web/src/insights/classKey.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'apps/web/src/insights/classKey.test.ts', to: 'apps/relay/src/store.ts' },
            {
              from: 'apps/web/src/insights/classKey.test.ts',
              to: 'apps/relay/src/channelMaintenance.ts',
            },
            { from: 'apps/web/src/insights/mailbox.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'apps/web/src/insights/mailbox.test.ts', to: 'apps/relay/src/store.ts' },
            { from: 'apps/web/src/insights/outbox.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'apps/web/src/insights/outbox.test.ts', to: 'apps/relay/src/store.ts' },
            { from: 'apps/web/src/shareLinks/verifyOwner.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'apps/web/src/shareLinks/verifyOwner.test.ts', to: 'apps/relay/src/store.ts' },
            { from: 'apps/web/src/teacher/connectionStore.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'apps/web/src/teacher/connectionStore.test.ts', to: 'apps/relay/src/store.ts' },
            { from: 'tests/e2e/fixtures/aiRelay.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'tests/e2e/fixtures/aiRelay.ts', to: 'apps/relay/src/store.ts' },
            { from: 'tests/e2e/gaps-artefact-labels.spec.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-artefact-labels.spec.ts', to: 'apps/relay/src/store.ts' },
            { from: 'tests/e2e/gaps-course-connection.spec.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-course-connection.spec.ts', to: 'apps/relay/src/store.ts' },
            { from: 'tests/e2e/gaps-daily-flow.spec.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'tests/e2e/gaps-daily-flow.spec.ts', to: 'apps/relay/src/store.ts' },
            { from: 'tests/e2e/share-links.spec.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'tests/e2e/share-links.spec.ts', to: 'apps/relay/src/store.ts' },
            { from: 'scripts/library-publish-cli.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'scripts/library-publish-cli.test.ts', to: 'apps/relay/src/store.ts' },
            { from: 'scripts/library-publish.test.ts', to: 'apps/relay/src/relay.ts' },
            { from: 'scripts/library-publish.test.ts', to: 'apps/relay/src/store.ts' },
          ],
        },
      ],
    },
  },
  {
    files: ['{apps/desktop/mcp,apps/ai/api}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    plugins: { 'app-contract': { rules: { 'no-deep-imports': appImportsRule } } },
    rules: { 'app-contract/no-deep-imports': 'error' },
  },
  {
    files: [
      '{apps/web/src,apps/ai/server,apps/desktop,apps/ai/api}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
    ],
    plugins: { 'training-contract': { rules: { 'no-deep-imports': trainingImportsRule } } },
    rules: {
      'training-contract/no-deep-imports': [
        'error',
        {
          integrationTests: [
            {
              from: 'apps/web/src/fsrs/halfLifeLogisticModel.test.ts',
              to: 'tooling/short-term-memory/coefficients/half-life-logistic-v1.json',
            },
            {
              from: 'apps/web/src/fsrs/halfLifeLogisticModel.test.ts',
              to: 'tooling/short-term-memory/tests/fixtures/model-port-v3.json',
            },
          ],
        },
      ],
    },
  },
  prettier,
];
