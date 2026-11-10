import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { readAttemptJobs, readWorkflowRun } from './ci-wait-for-renderer.mjs';

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

export function planShards(tests, timings, total, early = total) {
  assert.ok(Number.isSafeInteger(total) && total > 0, 'Invalid shard count');
  assert.ok(
    Number.isSafeInteger(early) && early > 0 && early <= total,
    'Invalid early shard count',
  );
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
  const shards = Array.from({ length: total }, (_, index) => ({
    files: [],
    tests: [],
    estimatedMs: 0,
    weight: index < early ? 1 : 3,
  }));
  const groups = [...files.values()].sort(
    (a, b) => b.estimatedMs - a.estimatedMs || a.file.localeCompare(b.file),
  );
  for (const [index, group] of groups.entries()) {
    const empty = shards.filter((shard) => !shard.files.length);
    const candidates = groups.length - index === empty.length ? empty : shards;
    // Reserve most of the work for runners that can start before the build finishes.
    const score = (shard) => (shard.estimatedMs + group.estimatedMs) * shard.weight;
    const shard = candidates.reduce((best, next) => (score(next) < score(best) ? next : best));
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
  delete env.CI_PEER_JOB_TOKEN;
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

function prepareShard(shard, total, early, evidence) {
  const discovered = inventory(listTests());
  const shards = planShards(discovered, JSON.parse(readFileSync(timingPath, 'utf8')), total, early);
  const plan = {
    shard,
    total,
    early,
    discovered: discovered.map(({ id }) => id),
    shards: shards.map(({ files, tests, estimatedMs }) => ({
      files,
      identities: tests.map(({ id }) => id),
      estimatedMs,
    })),
  };
  // Playwright clears outputDir before reading --test-list, so keep inputs outside it.
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence, 'functional-shard-plan.json'), JSON.stringify(plan, null, 2));
  return plan;
}

export async function firstFailedPeer(read, runId, attempt, signal) {
  let warned = false;
  // Share the workflow token's API budget with renderer and artefact verification.
  for (let poll = 0; poll < 6 && !signal.aborted; poll++) {
    try {
      const jobs = await readAttemptJobs(read, attempt);
      const failure = jobs.find(
        (job) =>
          job.run_id === Number(runId) &&
          job.run_attempt === Number(attempt) &&
          job.status === 'completed' &&
          ['failure', 'timed_out'].includes(job.conclusion),
      );
      if (failure) return failure.name;
    } catch (error) {
      if (!signal.aborted && !warned) {
        console.warn(
          'Could not inspect peer CI jobs. Continuing browser validation.',
          error.message,
        );
        warned = true;
      }
    }
    if (poll < 5) await delay(12_000, undefined, { signal }).catch(() => {});
  }
}

async function runPlaywright(args) {
  const { CI_PEER_JOB_TOKEN: token, ...env } = process.env;
  if (!token) return spawnSync(process.execPath, args, { stdio: 'inherit' }).status ?? 1;

  const { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: attempt } = env;
  const controller = new AbortController();
  const { signal } = controller;
  const read = readWorkflowRun({
    repository,
    runId,
    token,
    request: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.any([signal, options.signal]) }),
  });
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', detached: true });
  let peerFailure;
  let forceStop;
  function interrupt() {
    if (forceStop) return;
    child.kill('SIGINT');
    // Let Playwright write its interrupted report before stopping a stuck process group.
    forceStop = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') console.error(error);
      }
    }, 5_000);
  }
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const watch = firstFailedPeer(read, runId, attempt, signal).then((failure) => {
    if (!failure || signal.aborted) return;
    peerFailure = failure;
    console.error(`Stopping this browser shard because ${failure} failed in this attempt.`);
    interrupt();
  });
  try {
    const [code] = await once(child, 'close');
    return peerFailure ? 1 : (code ?? 1);
  } finally {
    controller.abort();
    await watch;
    clearTimeout(forceStop);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'timing') {
    process.exitCode = await runPlaywright([
      'node_modules/playwright/cli.js',
      'test',
      '-c',
      config,
      ...args,
    ]);
  } else if (command === 'refresh') {
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
    assert.ok(['plan', 'run', 'run-prepared'].includes(command), 'Unknown browser shard command');
    assert.match(args[0] ?? '', /^[1-9]\d*\/[1-9]\d*$/);
    const [current, total] = args[0].split('/').map(Number);
    const early = Number(process.env.FUNCTIONAL_EARLY_SHARDS ?? total);
    assert.ok(current <= total, 'Shard index exceeds total');
    assert.equal(args.length, 1, 'Pass exactly one whole-file shard');
    const evidence = resolve('artifacts/ci-browser-shards');
    const plan =
      command === 'run-prepared'
        ? JSON.parse(readFileSync(resolve(evidence, 'functional-shard-plan.json'), 'utf8'))
        : prepareShard(current, total, early, evidence);
    assert.equal(plan.shard, current);
    assert.equal(plan.total, total);
    assert.equal(plan.early, early);
    if (command === 'plan') process.exit(0);
    const selected = plan.shards[current - 1];
    const list = resolve(evidence, 'functional-shard.txt');
    writeFileSync(list, selected.files.map((file) => `[${project}] > ${file}`).join('\n'));
    const reportPath = resolve('test-results/browser-results.json');
    rmSync(reportPath, { force: true });
    const status = await runPlaywright([
      'node_modules/playwright/cli.js',
      'test',
      '-c',
      config,
      `--project=${project}`,
      '--test-list',
      list,
      '--workers=3',
      '--max-failures=1',
    ]);
    if (status === 0) {
      verifyInventory(
        selected.identities.map((id) => ({ id })),
        inventory(JSON.parse(readFileSync(reportPath, 'utf8'))),
      );
    }
    process.exitCode = status;
  }
}
