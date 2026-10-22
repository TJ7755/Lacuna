import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repository = resolve(import.meta.dirname, '..');
const directories: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lacuna-architecture-'));
  directories.push(root);
  return {
    root,
    write(file: string, source: string) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, source);
    },
  };
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const cycles = (root: string) =>
  spawnSync(process.execPath, [join(repository, 'scripts/check-import-cycles.mjs'), root], {
    encoding: 'utf8',
    timeout: 20_000,
  });

describe('domain-to-UI boundary', () => {
  it('uses the real ESLint configuration to reject resolved UI contracts and accept domain contracts', () => {
    const project = fixture();
    project.write(
      'tsconfig.app.json',
      JSON.stringify({
        compilerOptions: {
          paths: { '@ui/*': ['./src/components/*'] },
        },
      }),
    );
    for (const folder of ['components', 'pages', 'teacher', 'db']) {
      project.write(
        `src/${folder}/contract.ts`,
        'export interface Contract {}\nexport const value = 1;',
      );
    }
    project.write('src/components/declaration.d.ts', 'export interface Contract {}');
    project.write('src/pages/runtime.js', 'export const value = 1;');
    project.write('src/pages/runtime.d.ts', 'export declare const value: number;');
    project.write('src/components/import/mergeReviewRows.ts', 'export const value = 1;');
    project.write('src/components/analytics/prepare.ts', 'export const value = 1;');
    const probes = [
      ...['db', 'fsrs', 'sync', 'ai', 'mcp', 'questions', 'state', 'course'].map((domain) => ({
        filePath: `src/${domain}/probe.ts`,
        source:
          "import type { Contract } from '../components/contract'; export type Result = Contract;",
        forbidden: true,
      })),
      ...[
        "export { value } from '../pages/contract';",
        "export type { Contract } from '../teacher/contract';",
        "export * from '../components/contract';",
        "export const load = () => import('../teacher/contract');",
        "export const load = () => require('../components/contract');",
        "import contract = require('../components/contract'); export { contract };",
        "export type Result = import('../pages/contract').Contract;",
        "export { value } from '../course/../components/contract.js';",
        "export type { Contract } from '@ui/contract';",
        "export { value } from '../components';",
        "export type { Contract } from '../components/declaration';",
        "export { value } from '../pages/runtime.js';",
        "export type Result = typeof import('../pages/runtime.js').value;",
        'export const load = () => import(`../components/contract`);',
        "export { value } from '../components/contract?worker';",
      ].map((source) => ({ filePath: 'src/course/probe.ts', source, forbidden: true })),
      {
        filePath: 'src/db/lessonPrerequisites.test.ts',
        source: "export { value } from '../components/import/mergeReviewRows';",
        forbidden: false,
      },
      {
        filePath: 'src/db/sessionHistoryRead.test.ts',
        source: "export { value } from '../components/analytics/prepare';",
        forbidden: false,
      },
      {
        filePath: 'src/db/lessonPrerequisites.test.ts',
        source: "export { value } from '../components/contract';",
        forbidden: true,
      },
      {
        filePath: 'src/course/probe.test.ts',
        source: "export { value } from '../components/contract';",
        forbidden: true,
      },
      {
        filePath: 'src/course/probe.ts',
        source: "export type { Contract } from '../db/contract';",
        forbidden: false,
      },
      {
        filePath: 'src/pages/probe.ts',
        source: "export type { Contract } from '../components/contract';",
        forbidden: false,
      },
    ];
    project.write('src/components/index.ts', "export * from './contract';");
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { ESLint } from ${JSON.stringify(pathToFileURL(join(repository, 'node_modules/eslint/lib/api.js')).href)};
      import config from ${JSON.stringify(pathToFileURL(join(repository, 'eslint.config.js')).href)};
      const eslint = new ESLint({ cwd: ${JSON.stringify(project.root)}, overrideConfigFile: true,
        overrideConfig: [...config, { files: ['**/*.ts'], languageOptions: { parserOptions: { project: null } },
          rules: { '@typescript-eslint/no-floating-promises': 'off' } }] });
      const counts = [];
      for (const probe of ${JSON.stringify(probes)}) {
        const [result] = await eslint.lintText(probe.source, { filePath: probe.filePath });
        if (result.messages.some(message => message.fatal)) throw new Error(JSON.stringify(result.messages));
        counts.push(result.messages.filter(message => message.ruleId === 'architecture/no-domain-ui').length);
      }
      console.log(JSON.stringify(counts));
    `,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(probes.map((probe) => Number(probe.forbidden)));
  });
});

describe('src value-import cycles', () => {
  it('accepts a DAG, type-only back edges and cycles outside src', () => {
    const project = fixture();
    project.write('src/a.ts', "export { value } from './b.js'; export type Shape = { a: string };");
    project.write(
      'src/b.ts',
      "import type { Shape } from './a'; export type Copy = Shape; export const value = 1;",
    );
    project.write('src/c.ts', "import { type Shape } from './a'; export type Copy = Shape;");
    project.write('src/d.ts', "export type { Shape } from './a';");
    project.write('src/e.ts', "export { type Shape } from './a';");
    project.write('src/a.test.ts', "import { value } from './a'; export { value };");
    project.write('outside/a.ts', "import './b';");
    project.write('outside/b.ts', "import './a';");
    const result = cycles(project.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 tracked exceptions');
  });

  it.each([
    "import type { Shape } from './a'; export type Copy = Shape;",
    "import { type Shape } from './a'; export type Copy = Shape;",
    "export type { Shape } from './a';",
    "export { type Shape } from './a';",
    "export type * from './a';",
    "export type Shape = import('./a').Shape;",
  ])('accepts an explicit type-only back edge (%s)', (backEdge) => {
    const project = fixture();
    project.write('src/a.ts', "import './b'; export type Shape = { a: string };");
    project.write('src/b.ts', backEdge);
    const result = cycles(project.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a self-import in a JavaScript source module', () => {
    const project = fixture();
    project.write('src/a.mjs', "import './a.mjs';");
    const result = cycles(project.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/a.mjs -> src/a.mjs');
  });

  it.each([
    ['js', 'd.ts'],
    ['jsx', 'd.ts'],
    ['mjs', 'd.mts'],
    ['cjs', 'd.cts'],
  ])('rejects a JavaScript cycle shadowed by companion declarations (%s)', (extension, declaration) => {
    const project = fixture();
    const source = (target: string) =>
      extension === 'cjs' ? `require('./${target}.cjs');` : `import './${target}.${extension}';`;
    project.write(`src/a.${extension}`, source('b'));
    project.write(`src/b.${extension}`, source('a'));
    expect(cycles(project.root).status).toBe(1);
    project.write(`src/a.${declaration}`, 'export {};');
    project.write(`src/b.${declaration}`, 'export {};');
    const result = cycles(project.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(`src/a.${extension} -> src/b.${extension}`);
    expect(result.stderr).toContain(`src/b.${extension} -> src/a.${extension}`);
  });

  it('resolves runtime aliases and indexes without adding explicit type-only edges', () => {
    const project = fixture();
    project.write(
      'tsconfig.app.json',
      JSON.stringify({ compilerOptions: { paths: { '@source/*': ['./src/*'] } } }),
    );
    project.write('src/a.ts', "import { b } from '@source/b'; export const a = () => b;");
    project.write('src/b/index.js', "import { a } from '../a'; export const b = () => a;");
    project.write('src/b/index.d.ts', 'export declare const b: () => unknown;');
    const result = cycles(project.root);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('src/a.ts -> src/b/index.js');
    expect(result.stderr).toContain('src/b/index.js -> src/a.ts');
    project.write('src/a.ts', "export type { b } from '@source/b';");
    const typeOnly = cycles(project.root);
    expect(typeOnly.error).toBeUndefined();
    expect(typeOnly.status, typeOnly.stderr).toBe(0);
  });

  it.each([
    [
      "import { b } from './b'; export const a = () => b;",
      "import { a } from './a'; export const b = () => a;",
    ],
    ["export * from './b';", "export * from './a';"],
    ["export const a = () => import('./b');", "export const b = () => import('./a');"],
    ["export const a = require('./b');", "export const b = require('./a');"],
    ["import './b';", "import './a';"],
    [
      "import { type B, b } from './b'; export const a = b;",
      "export { a as b } from './a'; export type B = string;",
    ],
    ["import b = require('./b'); export { b };", "import a = require('./a'); export { a };"],
    ["export const a = () => import('./b/index.js');", "export const b = () => import('../a');"],
  ])('rejects a controlled cycle (%s)', (a, b) => {
    const project = fixture();
    project.write('src/a.ts', a);
    project.write(a.includes('/index') ? 'src/b/index.ts' : 'src/b.ts', b);
    const result = cycles(project.root);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Untracked import cycle:');
    expect(result.stderr).toContain('src/a.ts -> src/b');
    expect(result.stderr).toContain(' -> src/a.ts');
  });

  it('accepts exact tracked edges, but rejects enlarged cycles and stale exceptions', () => {
    const project = fixture();
    project.write('src/a.ts', "import './b';");
    project.write('src/b.ts', "import './a';");
    project.write(
      'scripts/import-cycle-exceptions.json',
      JSON.stringify([
        {
          issue: 'https://github.com/TJ7755/Lacuna/issues/723',
          reason: 'Controlled existing cycle.',
          edges: ['src/a.ts -> src/b.ts', 'src/b.ts -> src/a.ts'],
        },
      ]),
    );
    expect(cycles(project.root).status).toBe(0);
    project.write('src/a.ts', "import './b'; import './c';");
    project.write('src/c.ts', "import './a';");
    const enlarged = cycles(project.root);
    expect(enlarged.status).toBe(1);
    expect(enlarged.stderr).toContain('Untracked import cycle:');
    expect(enlarged.stderr).toContain('Stale or undocumented');
    project.write('src/a.ts', 'export const a = 1;');
    const stale = cycles(project.root);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Stale or undocumented');
  });
});
