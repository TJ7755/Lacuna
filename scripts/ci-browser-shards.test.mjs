import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { inventory, planShards, refreshTimings, verifyInventory } from './ci-browser-shards.mjs';

const spec = (id, file, active = true) => ({
  id,
  file,
  tests: [
    {
      projectName: 'chromium-functional',
      expectedStatus: active ? 'passed' : 'skipped',
      status: active ? 'expected' : 'skipped',
      results: active ? [{ status: 'passed', duration: 10 }] : [],
    },
  ],
});
const report = (...specs) => ({ errors: [], suites: [{ specs }] });
const timings = {
  files: {
    'slow.spec.ts': { tests: 1, durationMs: 100 },
    'fast.spec.ts': { tests: 1, durationMs: 10 },
  },
};

test('whole-file balancing retains new, nested and skipped project/test identities exactly once', () => {
  const full = report(
    spec('slow-a', 'slow.spec.ts'),
    spec('slow-b', 'slow.spec.ts'),
    spec('fast', 'fast.spec.ts'),
    spec('new', 'nested/new.spec.ts'),
    spec('skip', 'skipped.spec.ts', false),
  );
  const tests = inventory(full);
  const shards = planShards(tests, timings, 2);
  verifyInventory(
    tests,
    shards.flatMap((shard) => shard.tests),
  );
  assert.equal(shards.filter((shard) => shard.files.includes('slow.spec.ts')).length, 1);
  assert.equal(
    shards
      .find((shard) => shard.files.includes('slow.spec.ts'))
      .tests.filter((test) => test.file === 'slow.spec.ts').length,
    2,
  );
  assert.deepEqual(
    planShards([...tests].reverse(), timings, 2).map((shard) => shard.files),
    shards.map((shard) => shard.files),
  );
  assert.ok(shards.some((shard) => shard.files.includes('nested/new.spec.ts')));
  assert.ok(shards.some((shard) => shard.tests.some((test) => !test.active)));
});

test('inventory verification fails for missing, extra, duplicate or wrong-project tests', () => {
  const tests = inventory(report(spec('a', 'a.spec.ts'), spec('b', 'b.spec.ts')));
  for (const actual of [
    tests.slice(1),
    [...tests, tests[0]],
    [...tests, { id: 'extra' }],
    tests.map((test) => ({ ...test, id: `other:${test.id}` })),
  ])
    assert.throws(() => verifyInventory(tests, actual));
  const wrong = spec('a', 'a.spec.ts');
  wrong.tests[0].projectName = 'chromium-image-performance';
  assert.throws(() => inventory(report(wrong)));
  assert.throws(() => inventory({ errors: [{ message: 'import failed' }], suites: [] }));
  assert.throws(() => inventory(report()));
  assert.throws(() => inventory(report(spec('a', '../escape.spec.ts'))));
  assert.throws(() => planShards(tests, timings, 3));
  assert.throws(() => planShards(tests, { files: { bad: { tests: 0, durationMs: 1 } } }, 2));
});

test('cost history affects placement but cannot remove discovery entries', () => {
  const tests = inventory(
    report(spec('a', 'a.spec.ts'), spec('b', 'b.spec.ts'), spec('c', 'c.spec.ts')),
  );
  for (const history of [timings, { files: { stale: { tests: 1, durationMs: 1 } } }]) {
    const shards = planShards(tests, history, 2);
    verifyInventory(
      tests,
      shards.flatMap((shard) => shard.tests),
    );
    assert.ok(shards.every((shard) => shard.tests.length));
  }
});

test('refresh rejects duplicated, failed and retried evidence', () => {
  const successful = report(spec('a', 'a.spec.ts'));
  assert.deepEqual(refreshTimings([successful], { run: 'example' }), {
    source: { run: 'example' },
    files: { 'a.spec.ts': { tests: 1, durationMs: 10 } },
  });
  assert.throws(() => refreshTimings([successful, successful], {}));
  const failed = report(spec('a', 'a.spec.ts'));
  failed.suites[0].specs[0].tests[0].status = 'unexpected';
  assert.throws(() => refreshTimings([failed], {}));
  const retried = report(spec('a', 'a.spec.ts'));
  retried.suites[0].specs[0].tests[0].results.push({ status: 'passed', duration: 10 });
  assert.throws(() => refreshTimings([retried], {}));
});

test('real Playwright test-list parsing preserves parameterised, serial and skipped identities', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lacuna-browser-shards-')));
  try {
    symlinkSync(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    mkdirSync(join(directory, 'nested'));
    writeFileSync(
      join(directory, 'playwright.config.mjs'),
      `export default {
      testDir: '.', fullyParallel: true, projects: [{name: 'chromium-functional'}, {name: 'other'}]
    };`,
    );
    for (const file of ['a.spec.ts', 'b.spec.ts', 'nested/new.spec.ts'])
      writeFileSync(
        join(directory, file),
        `import { test } from '@playwright/test';
        test.describe.serial('serial group', () => {
          for (const n of [1, 2]) test('parameter ' + n, () => {});
          test.skip('skipped case', () => {});
        });`,
      );
    const list = (args = []) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve('node_modules/playwright/cli.js'),
          'test',
          '-c',
          join(directory, 'playwright.config.mjs'),
          '--project=chromium-functional',
          '--list',
          '--reporter=json',
          ...args,
        ],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            PLAYWRIGHT_JSON_OUTPUT_FILE: '',
            PLAYWRIGHT_JSON_OUTPUT_DIR: '',
            PLAYWRIGHT_JSON_OUTPUT_NAME: '',
          },
        },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return inventory(JSON.parse(result.stdout));
    };
    const all = list();
    const selected = [];
    for (const [index, shard] of planShards(all, timings, 2).entries()) {
      const path = join(directory, `shard-${index}.txt`);
      writeFileSync(path, shard.files.map((file) => `[chromium-functional] > ${file}`).join('\n'));
      const actual = list(['--test-list', path]);
      verifyInventory(shard.tests, actual);
      selected.push(...actual);
    }
    verifyInventory(all, selected);
    assert.equal(selected.length, 9);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the shard CLI executes tests and retains its selector and plan after output cleanup', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lacuna-browser-shard-run-')));
  try {
    symlinkSync(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    for (const path of ['scripts', 'tests/config', 'tests/e2e', 'test-results'])
      mkdirSync(join(directory, path), { recursive: true });
    for (const file of ['ci-browser-shards.mjs', 'ci-browser-timings.json'])
      copyFileSync(resolve('scripts', file), join(directory, 'scripts', file));
    writeFileSync(
      join(directory, 'tests/config/playwright.web.ci.config.ts'),
      `export default {
      testDir: '../e2e', outputDir: '../../test-results', workers: 1,
      reporter: 'list', projects: [{ name: 'chromium-functional' }]
    };`,
    );
    writeFileSync(
      join(directory, 'tests/e2e/execution.spec.ts'),
      `
      import { test } from '@playwright/test';
      import { writeFileSync } from 'node:fs';
      test('executes the selected test', () => writeFileSync('executed.txt', 'executed'));
    `,
    );
    const sentinel = join(directory, 'test-results/old-output.txt');
    writeFileSync(sentinel, 'must be cleared');
    const result = spawnSync(process.execPath, ['scripts/ci-browser-shards.mjs', 'run', '1/1'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        PLAYWRIGHT_JSON_OUTPUT_FILE: '',
        PLAYWRIGHT_JSON_OUTPUT_DIR: '',
        PLAYWRIGHT_JSON_OUTPUT_NAME: '',
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(join(directory, 'executed.txt'), 'utf8'), 'executed');
    assert.equal(existsSync(sentinel), false, 'Playwright must have cleared its output directory');
    const evidence = join(directory, 'artifacts/ci-browser-shards');
    assert.equal(
      readFileSync(join(evidence, 'functional-shard.txt'), 'utf8'),
      '[chromium-functional] > execution.spec.ts',
    );
    const plan = JSON.parse(readFileSync(join(evidence, 'functional-shard-plan.json'), 'utf8'));
    assert.equal(plan.shard, 1);
    assert.deepEqual(plan.shards[0].identities, plan.discovered);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
