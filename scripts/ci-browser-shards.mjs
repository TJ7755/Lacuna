import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = 'tests/config/playwright.web.ci.config.ts';
const project = 'chromium-functional';
const timingPath = new URL('./ci-browser-timings.json', import.meta.url);

export function inventory(report) {
  assert.deepEqual(report.errors, [], 'Playwright discovery must succeed');
  const tests = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      assert.match(spec.file, /^[\w./-]+\.spec\.ts$/, 'Unrepresentable test-list filename');
      assert.ok(!spec.file.split('/').includes('..'), 'Test paths must stay inside testDir');
      for (const test of spec.tests) {
        assert.equal(test.projectName, project, 'Unexpected browser project');
        assert.ok(spec.id, 'Test identity is required');
        tests.push({
          id: `${test.projectName}:${spec.id}`,
          file: spec.file,
          active: test.expectedStatus !== 'skipped',
          test,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  assert.ok(tests.length, 'No functional browser tests discovered');
  assert.equal(new Set(tests.map((test) => test.id)).size, tests.length, 'Duplicate test identity');
  return tests;
}

export function planShards(tests, timings, total) {
  assert.ok(Number.isSafeInteger(total) && total > 0, 'Invalid shard count');
  const costs = Object.values(timings.files)
    .map(({ tests, durationMs }) => {
      assert.ok(Number.isSafeInteger(tests) && tests > 0, 'Invalid historical test count');
      assert.ok(Number.isFinite(durationMs) && durationMs > 0, 'Invalid historical duration');
      return durationMs / tests;
    })
    .sort((a, b) => a - b);
  assert.ok(costs.length, 'Timing snapshot is empty');
  const fallback = costs[Math.floor(costs.length / 2)];
  const files = new Map();
  for (const test of tests) {
    if (!files.has(test.file)) files.set(test.file, { file: test.file, tests: [] });
    files.get(test.file).tests.push(test);
  }
  assert.ok(files.size >= total, 'More shards than test files');
  for (const group of files.values()) {
    const previous = timings.files[group.file];
    // History estimates cost only. Discovery owns inclusion, including new and skipped tests.
    group.estimatedMs =
      Math.max(1, group.tests.filter((test) => test.active).length) *
      (previous ? previous.durationMs / previous.tests : fallback);
  }
  const shards = Array.from({ length: total }, () => ({ files: [], tests: [], estimatedMs: 0 }));
  for (const group of [...files.values()].sort(
    (a, b) => b.estimatedMs - a.estimatedMs || a.file.localeCompare(b.file),
  )) {
    const shard = shards.reduce((best, next) =>
      next.estimatedMs < best.estimatedMs ? next : best,
    );
    shard.files.push(group.file);
    shard.tests.push(...group.tests);
    shard.estimatedMs += group.estimatedMs;
  }
  verifyInventory(
    tests,
    shards.flatMap((shard) => shard.tests),
  );
  return shards;
}

export function verifyInventory(expected, actual) {
  assert.equal(
    new Set(actual.map((test) => test.id)).size,
    actual.length,
    'A test was scheduled twice',
  );
  assert.deepEqual(
    actual.map((test) => test.id).sort(),
    expected.map((test) => test.id).sort(),
    'Scheduled project/test identities differ from discovery',
  );
}

export function refreshTimings(reports, source) {
  const all = reports.flatMap(inventory);
  verifyInventory(all, all);
  const files = {};
  for (const { file, active, test } of all) {
    assert.ok(['expected', 'skipped'].includes(test.status), 'Use successful, non-flaky reports');
    assert.ok(test.results.length <= 1, 'Use reports without retries');
    if (!active) continue;
    assert.equal(test.results[0]?.status, 'passed', 'Every active test must have passed');
    files[file] ??= { tests: 0, durationMs: 0 };
    files[file].tests++;
    files[file].durationMs += test.results[0].duration;
  }
  return {
    source,
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function listTests(extra = []) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PLAYWRIGHT_JSON_OUTPUT')) delete env[key];
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/playwright/cli.js',
      'test',
      '-c',
      config,
      `--project=${project}`,
      '--list',
      '--reporter=json',
      ...extra,
    ],
    { env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'refresh') {
    const [commit, run, ...paths] = args;
    assert.match(commit ?? '', /^[a-f0-9]{40}$/);
    assert.match(run ?? '', /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/);
    const reports = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
    assert.ok(reports.length, 'Provide all functional shard JSON reports');
    const versions = new Set(reports.map((report) => report.config.version));
    assert.equal(versions.size, 1, 'Use reports from the same Playwright version');
    verifyInventory(inventory(listTests()), reports.flatMap(inventory));
    const source = { commit, run, playwright: reports[0].config.version };
    writeFileSync(timingPath, `${JSON.stringify(refreshTimings(reports, source), null, 2)}\n`);
  } else {
    assert.equal(command, 'run', 'Use run current/total or refresh commit run-url reports...');
    assert.match(args[0] ?? '', /^[1-9]\d*\/[1-9]\d*$/);
    const [current, total] = args[0].split('/').map(Number);
    assert.ok(current <= total, 'Shard index exceeds total');
    const discovered = inventory(listTests());
    const shards = planShards(discovered, JSON.parse(readFileSync(timingPath, 'utf8')), total);
    const selected = shards[current - 1];
    mkdirSync('test-results', { recursive: true });
    const list = resolve('test-results/functional-shard.txt');
    writeFileSync(list, selected.files.map((file) => `[${project}] > ${file}`).join('\n'));
    // Ask Playwright itself to prove that its selector retained exactly the planned identities.
    verifyInventory(selected.tests, inventory(listTests(['--test-list', list])));
    writeFileSync(
      'test-results/functional-shard-plan.json',
      JSON.stringify(
        {
          shard: current,
          total,
          discovered: discovered.map(({ id }) => id),
          shards: shards.map(({ files, tests, estimatedMs }) => ({
            files,
            identities: tests.map(({ id }) => id),
            estimatedMs,
          })),
        },
        null,
        2,
      ),
    );
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/playwright/cli.js',
        'test',
        '-c',
        config,
        `--project=${project}`,
        '--test-list',
        list,
      ],
      { stdio: 'inherit' },
    );
    process.exitCode = result.status ?? 1;
  }
}
