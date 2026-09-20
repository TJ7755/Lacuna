import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import legacyConfig from './.eslintrc.cjs';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.ts'] },
  ...fixupConfigRules(compat.config(legacyConfig)),
];
