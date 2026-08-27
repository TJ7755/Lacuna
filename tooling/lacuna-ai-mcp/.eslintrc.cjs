const repositoryConfig = require('../../.eslintrc.cjs');

module.exports = {
  ...repositoryConfig,
  root: true,
  env: { browser: false, node: true, es2022: true },
  parserOptions: {
    ...repositoryConfig.parserOptions,
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
};
