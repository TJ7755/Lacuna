import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { classifyPaths } from './ci-change-scope.mjs';
import { requireAuditedInstaller } from './windows-ci-upgrade.mjs';

const workflow = parse(
  readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
);
const required = [
  'typecheck',
  'lint',
  'test',
  'relay',
  'ai-mcp',
  'production',
  'browser-smoke',
  'electron-ai',
];

// The workflow predicates use this shared JavaScript/Actions expression subset.
// This checks those predicates, not GitHub's scheduler or branch-protection service.
function render(value, action, changes = {}, cancelled = false, attempt = 1) {
  const context = {
    github: {
      event_name: action ? 'pull_request' : 'push',
      run_id: 9001,
      run_attempt: attempt,
      sha: 'push-sha',
      ref: 'refs/heads/master',
      event: { action, changes, pull_request: action ? { number: 42 } : {} },
    },
    always: () => true,
    cancelled: () => cancelled,
    format: (template, value) => template.replace('{0}', value),
  };
  return value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
    String(runInNewContext(expression, context)),
  );
}

test('stacked pull requests receive validation on any base branch', () => {
  const security = parse(
    readFileSync(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8'),
  );
  for (const configuration of [workflow, security]) {
    assert.ok(Object.hasOwn(configuration.on, 'pull_request'));
    const trigger = configuration.on.pull_request;
    assert.equal(trigger?.branches, undefined);
    assert.equal(trigger?.['branches-ignore'], undefined);
  }
});

test('metadata edits start no run and code events retain required contexts', () => {
  assert.deepEqual(workflow.on.pull_request.types, [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
  ]);
  assert.equal(
    workflow.jobs.changes.steps.some((step) => step.id === 'metadata'),
    false,
  );
  for (const job of required) assert.equal(workflow.jobs[job].name, job);
  assert.equal(render(workflow.concurrency.group, 'synchronize'), 'ci-42');
  assert.equal(render(workflow.concurrency.group, undefined), 'ci-refs/heads/master');
  assert.equal(render(workflow.concurrency['cancel-in-progress'], undefined), 'true');
});

test('aggregate gates run after dependency failures but do not run after workflow cancellation', () => {
  for (const job of ['test', 'browser-smoke']) {
    assert.match(workflow.jobs[job].if, /always\(\)/);
    assert.equal(render(workflow.jobs[job].if, 'synchronize', {}, true), 'false');
    assert.equal(render(workflow.jobs[job].if, 'synchronize'), 'true');
  }
});

test('documentation-only changes resolve required names without running heavy steps', () => {
  const aggregates = ['test', 'browser-smoke', 'electron-ai'];
  for (const name of required.filter((name) => !aggregates.includes(name))) {
    const job = workflow.jobs[name];
    assert.equal(
      job.if,
      name === 'production'
        ? "${{ !cancelled() && needs.changes.result == 'success' }}"
        : "needs.changes.result == 'success'",
      name,
    );
    const [acknowledgement, ...heavySteps] = job.steps;
    assert.equal(
      acknowledgement.if,
      name === 'typecheck'
        ? "(needs.changes.outputs.app == 'false' && needs.changes.outputs.web_tests == 'false')"
        : name === 'production'
          ? "(needs.changes.outputs.app == 'false' && needs.changes.outputs.sites == 'false')"
          : `needs.changes.outputs.${{ 'ai-mcp': 'ai_mcp', typecheck: 'app' }[name] ?? name} == 'false'`,
      name,
    );
    assert.equal(acknowledgement.shell, 'bash', name);
    assert.ok(acknowledgement.run.includes('GITHUB_STEP_SUMMARY'), name);
    assert.ok(heavySteps.length > 0, name);
    for (const step of heavySteps.filter(
      (step) => step.name !== 'Verify standalone site contracts',
    )) {
      assert.equal(
        step.if,
        name === 'typecheck'
          ? "(needs.changes.outputs.app != 'false' || needs.changes.outputs.web_tests != 'false')"
          : name === 'production'
            ? "(needs.changes.outputs.app != 'false' || needs.changes.outputs.sites != 'false')"
            : `needs.changes.outputs.${{ 'ai-mcp': 'ai_mcp', typecheck: 'app' }[name] ?? name} != 'false'`,
        `${name}: ${step.uses ?? step.run}`,
      );
    }
  }
});

const fullBrowserResults = ['RESULT', 'TIMING_RESULT', 'STANDALONE_RESULT'];
const gateCases = (job) =>
  job === 'browser-smoke'
    ? [
        { event: 'pull_request', browserCI: 'false', ignored: fullBrowserResults },
        { event: 'pull_request', browserCI: 'true', ignored: [] },
        { event: 'pull_request', browserCI: '', ignored: [] },
        { event: 'push', browserCI: 'false', ignored: ['PR_RESULT'] },
      ]
    : [{ event: 'pull_request', ignored: [] }];

test('aggregate shell gates fail closed and report each dependency result', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-gates-'));
  try {
    for (const job of ['test', 'browser-smoke'])
      for (const { event, browserCI, ignored } of gateCases(job)) {
        const step = workflow.jobs[job].steps[0];
        const results = Object.keys(step.env).filter(
          (key) => key.endsWith('RESULT') && !ignored.includes(key),
        );
        const run = (overrides) => {
          const summary = join(directory, `${job}.md`);
          writeFileSync(summary, '');
          const env = {
            ...process.env,
            APP: 'true',
            SITES: 'true',
            ELECTRON: 'true',
            HANDWRITING: 'true',
            PYTHON: 'true',
            EVENT_NAME: event,
            BROWSER_CI: browserCI ?? '',
            GITHUB_STEP_SUMMARY: summary,
            ...Object.fromEntries(ignored.map((key) => [key, 'skipped'])),
            ...Object.fromEntries(results.map((key) => [key, 'success'])),
            ...overrides,
          };
          const result = spawnSync('bash', ['-e', '-c', step.run], { env, encoding: 'utf8' });
          return { ...result, summary: readFileSync(summary, 'utf8') };
        };
        assert.equal(run({}).status, 0);
        for (const key of results) {
          for (const status of ['failure', 'cancelled', 'skipped', '']) {
            const result = run({ [key]: status });
            assert.equal(result.status, 1, `${job} ${event}: ${key}=${status}`);
            assert.ok(result.summary.includes(status));
          }
        }
        const docs = Object.fromEntries(
          results
            .filter((key) => !['SCOPE_RESULT', 'DOCUMENTATION_RESULT'].includes(key))
            .map((key) => [key, 'skipped']),
        );
        assert.equal(
          run({
            ...docs,
            APP: 'false',
            SITES: 'false',
            ELECTRON: 'false',
            HANDWRITING: 'false',
            PYTHON: 'false',
          }).status,
          0,
        );
        assert.equal(
          run({
            ...docs,
            APP: 'false',
            SITES: 'false',
            ELECTRON: 'false',
            HANDWRITING: 'false',
            PYTHON: 'false',
            SCOPE_RESULT: 'failure',
          }).status,
          1,
        );
        for (const key of Object.keys(docs)) {
          assert.equal(
            run({
              ...docs,
              APP: 'false',
              SITES: 'false',
              ELECTRON: 'false',
              HANDWRITING: 'false',
              PYTHON: 'false',
              [key]: 'failure',
            }).status,
            1,
          );
          assert.equal(
            run({
              ...docs,
              APP: 'false',
              SITES: 'false',
              ELECTRON: 'false',
              HANDWRITING: 'false',
              PYTHON: 'false',
              [key]: 'cancelled',
            }).status,
            1,
          );
        }
      }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('browser consumers install the lockfile browser and share the production artefact', () => {
  const jobs = workflow.jobs;
  const consumers = ['browser-pr', 'browser-tests', 'browser-timing'];
  const build = jobs['web-build'];
  const producer = build.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(producer);
  assert.equal(build.outputs.artifact_id, '${{ steps.dist.outputs.artifact-id }}');
  assert.equal(producer.id, 'dist');
  assert.equal(producer.with.name, 'browser-web-dist-${{ github.run_attempt }}');
  assert.equal(producer.with.overwrite, undefined);
  for (const name of [...consumers, 'browser-standalone']) {
    const job = jobs[name];
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    assert.equal(job.container, undefined);
    const installPackages = job.steps.findIndex(
      (step) => step.run === 'bun install --frozen-lockfile',
    );
    const installBrowser = job.steps.findIndex(
      (step) => step.run === 'bunx --no-install playwright install --only-shell chromium',
    );
    assert.ok(installPackages >= 0 && installBrowser > installPackages);
    assert.ok(jobs['browser-smoke'].needs.includes(name));
  }
  for (const name of [...consumers, 'production']) {
    const job = jobs[name];
    assert.deepEqual(job.needs, ['changes', 'web-build']);
    const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'));
    assert.equal(download.with['artifact-ids'], '${{ needs.web-build.outputs.artifact_id }}');
    assert.equal(download.with.path, producer.with.path);
    if (name !== 'production') assert.equal(job.env.LACUNA_BROWSER_PREBUILT, 'true');
  }
  const timing = jobs['browser-timing'];
  assert.deepEqual(timing.strategy.matrix.include, [
    { project: 'chromium-image-performance', shard: 1, total: 1 },
    { project: 'chromium-study-performance', shard: 1, total: 2 },
    { project: 'chromium-study-performance', shard: 2, total: 2 },
  ]);
  assert.ok(
    timing.steps.some((step) =>
      /--project=\$\{\{ matrix.project }} --workers=1/.test(step.run ?? ''),
    ),
  );
  assert.ok(jobs['browser-smoke'].needs.includes('production'));
  assert.equal(
    jobs['browser-smoke'].steps[0].env.PRODUCTION_RESULT,
    '${{ needs.production.result }}',
  );
  assert.deepEqual(
    jobs['browser-tests'].strategy.matrix.shard,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  );
  assert.deepEqual(jobs['browser-tests'].strategy.matrix.lane, [1, 2]);
  assert.ok(
    jobs['browser-tests'].steps.some(
      (step) =>
        step.run ===
        'node scripts/ci-browser-shards.mjs run ${{ matrix.shard }}/16 ${{ matrix.lane }}/2',
    ),
  );
  const functionalEvidence = jobs['browser-tests'].steps.find(
    (step) => step.name === 'Preserve browser test evidence',
  );
  assert.equal(functionalEvidence.if, 'always()');
  assert.ok(functionalEvidence.with.path.split('\n').includes('artifacts/ci-browser-shards/'));
  const steps = jobs['browser-pr'].steps;
  const releaseSmoke = steps.find((step) => step.name === 'Run release smoke');
  assert.match(releaseSmoke.run, / release-smoke\.spec\.ts$/);
  assert.doesNotMatch(releaseSmoke.run, /--shard/);
  const discovery = steps.find((step) => step.name === 'Verify release smoke discovery');
  assert.match(discovery.run, / --list release-smoke\.spec\.ts$/);
  assert.doesNotMatch(discovery.run, /--shard/);
  const smoke = steps.find((step) => step.env?.CHANGED_SPECS);
  assert.ok(steps.indexOf(discovery) < steps.indexOf(smoke));
  assert.equal(smoke.env.CHANGED_SPECS, '${{ needs.changes.outputs.web_specs }}');
  assert.match(smoke.run, /--shard=\$\{\{ matrix.shard \}\}/);
  assert.match(smoke.run, /release-smoke\.spec\.ts \$CHANGED_SPECS$/);
});

test('production refuses a failed build or a missing artefact ID', () => {
  const step = workflow.jobs.production.steps.find(
    (step) => step.name === 'Require the current web build',
  );
  for (const [result, id, expected] of [
    ['success', '123', 0],
    ['success', '', 1],
    ['success', '1,2', 1],
    ['failure', '123', 1],
    ['skipped', '', 1],
  ]) {
    const execution = spawnSync('bash', ['-e', '-c', step.run], {
      env: { ...process.env, WEB_BUILD_RESULT: result, ARTIFACT_ID: id },
    });
    assert.equal(execution.status, expected);
  }
});

test('pull requests pass only plain changed web spec names to the browser smoke job', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-web-specs-'));
  try {
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init', '-q');
    git(
      '-c',
      'user.name=CI',
      '-c',
      'user.email=ci@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'base',
    );
    const base = git('rev-parse', 'HEAD');
    for (const path of [
      'tests/e2e/study-flip.spec.ts',
      'tests/e2e/fixtures/videoEmbeds.ts',
      'tests/e2e/nested/deep.spec.ts',
      'tests/e2e/$(touch pwned).spec.ts',
    ]) {
      mkdirSync(join(directory, path, '..'), { recursive: true });
      writeFileSync(join(directory, path), '');
    }
    git('add', '.');
    git('-c', 'user.name=CI', '-c', 'user.email=ci@example.invalid', 'commit', '-q', '-m', 'head');
    // The untracked link lets the step run the real scope classifier.
    symlinkSync(new URL('.', import.meta.url).pathname, join(directory, 'scripts'));
    const step = workflow.jobs.changes.steps.find((step) => step.id === 'scope');
    const output = join(directory, 'output');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: 'pull_request',
        BASE_SHA: base,
        HEAD_SHA: git('rev-parse', 'HEAD'),
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(output, 'utf8'), /^web_specs=study-flip\.spec\.ts$/m);
    writeFileSync(output, '');
    const failed = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: 'pull_request',
        BASE_SHA: 'missing-base',
        HEAD_SHA: git('rev-parse', 'HEAD'),
        GITHUB_OUTPUT: output,
      },
    });
    assert.notEqual(failed.status, 0);
    assert.equal(
      readFileSync(output, 'utf8'),
      '',
      'Failed Git discovery must not publish skip flags',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Windows skips the slow package cache while retaining verified runtime installation', () => {
  const action = parse(
    readFileSync(new URL('../.github/actions/setup-bun/action.yml', import.meta.url), 'utf8'),
  );
  const steps = action.runs.steps;
  const packages = steps.find((step) => step.name === 'Restore Bun package downloads');
  assert.equal(packages.if, "runner.os != 'Windows' && inputs.cache-packages == 'true'");
  const runtime = steps.find((step) => step.name === 'Restore verified Bun download');
  assert.equal(runtime.if, undefined);
  const install = steps.find(
    (step) => step.run === 'node apps/relay/scripts/security-bun.mjs --install',
  );
  assert.equal(install.if, undefined);
});

test('workspace installs cannot restore or save another workspace’s partial package cache', () => {
  const action = parse(readFileSync('.github/actions/setup-bun/action.yml', 'utf8'));
  const cache = action.runs.steps.find((step) => step.name === 'Restore Bun package downloads');
  const security = parse(readFileSync('.github/workflows/security.yml', 'utf8'));
  const namespaces = new Map();
  for (const job of [...Object.values(workflow.jobs), ...Object.values(security.jobs)]) {
    const setup = job.steps?.find((step) => step.uses === './.github/actions/setup-bun');
    const install = job.steps?.find((step) => step.run?.startsWith('bun install '));
    if (!setup || !install) continue;
    const workspace =
      install['working-directory'] ?? job.defaults?.run?.['working-directory'] ?? '.';
    const inputs = {
      ...Object.fromEntries(
        Object.entries(action.inputs ?? {}).map(([key, value]) => [key, value.default]),
      ),
      ...setup.with,
    };
    const expand = (value) =>
      value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
        String(
          runInNewContext(expression.replace(/inputs\.([\w-]+)/g, 'inputs["$1"]'), {
            inputs,
            runner: { os: 'Linux', arch: 'X64' },
            // Even identical lockfile contents must not allow cross-workspace fallback.
            hashFiles: () => 'same-content-hash',
          }),
        ),
      );
    const namespace = {
      key: expand(cache.with.key),
      prefix: expand(cache.with['restore-keys']).trim(),
    };
    if (namespaces.has(workspace)) assert.deepEqual(namespace, namespaces.get(workspace));
    namespaces.set(workspace, namespace);
  }
  assert.equal(namespaces.size, 1);
  for (const [workspace, cacheKey] of namespaces) {
    for (const [other, otherCache] of namespaces) {
      if (workspace !== other)
        assert.equal(
          cacheKey.key.startsWith(otherCache.prefix),
          false,
          `${workspace} restores ${other}`,
        );
    }
  }
});

test('host and container installs consume the checkout-relative cache Actions restores', () => {
  const action = parse(readFileSync('.github/actions/setup-bun/action.yml', 'utf8'));
  const cache = action.runs.steps.find((step) => step.name === 'Restore Bun package downloads');
  const configure = action.runs.steps.find(
    (step) => step.name === 'Use the restored package download directory',
  );
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-cache-translation-'));
  try {
    for (const surface of ['host', 'container']) {
      const workspace = join(directory, surface, 'workspace');
      const runnerTemp = join(directory, surface, 'temp');
      const hostTemp = join(directory, 'host', 'temp');
      mkdirSync(workspace, { recursive: true });
      const environment = join(directory, `${surface}-environment`);
      // Only the cache diagnostic is stubbed: the action’s real shell exports the path.
      const bin = join(directory, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, 'bun'),
        '#!/bin/sh\nprintf "%s\\n" "${BUN_INSTALL_CACHE_DIR:-default-cache}"\n',
        { mode: 0o755 },
      );
      const result = spawnSync('bash', ['-e', '-c', configure.run], {
        cwd: workspace,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_ENV: environment,
          GITHUB_WORKSPACE: workspace,
          RUNNER_TEMP: runnerTemp,
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const exported = readFileSync(environment, 'utf8')
        .trim()
        .replace(/^BUN_INSTALL_CACHE_DIR=/, '');
      const restored = cache.with.path.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
        String(runInNewContext(expression, { runner: { temp: hostTemp } })),
      );
      assert.equal(
        resolve(exported),
        resolve(workspace, restored),
        `${surface} must consume the restored cache`,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a retry cannot share or cancel newer pull-request validation even if the branch advances after inspection', () => {
  for (const action of ['opened', 'synchronize', 'edited']) {
    const freshGroup = render(workflow.concurrency.group, action);
    const retryGroup = render(workflow.concurrency.group, action, {}, false, 2);
    assert.notEqual(retryGroup, freshGroup);
    assert.equal(retryGroup, 'ci-retry-9001');
    assert.equal(render(workflow.concurrency['cancel-in-progress'], action, {}, false, 2), 'false');
  }
});

test('Security records the tested workflow commit for guarded recovery', () => {
  const security = parse(
    readFileSync(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8'),
  );
  assert.equal(render(security['run-name'], 'synchronize'), 'Security push-sha');
});

test('scope collection uses NUL records, pipefail and conservative push classification', () => {
  const scope = workflow.jobs.changes.steps.find((step) => step.id === 'scope');
  assert.match(scope.run, /git diff --name-status -z --find-renames/);
  assert.match(scope.run, /--name-status/);
  assert.match(scope.run, /unknown-root-path/);
  // GitHub's default bash invocation has pipefail; specify it explicitly to make the contract visible.
  assert.equal(scope.shell, 'bash');
});

test('aggregate gates accept only explicitly unaffected dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-area-gates-'));
  try {
    for (const job of ['test', 'browser-smoke']) {
      const step = workflow.jobs[job].steps[0];
      const results = Object.keys(step.env).filter((key) => key.endsWith('RESULT'));
      const dependencies =
        job === 'test'
          ? {
              UNIT_RESULT: 'APP',
              COVERAGE_RESULT: 'APP',
              HANDWRITING_RESULT: 'HANDWRITING',
              PYTHON_RESULT: 'PYTHON',
              MACOS_ELECTRON_RESULT: 'ELECTRON',
            }
          : {
              PRODUCTION_RESULT: 'APP',
              RESULT: 'APP',
              TIMING_RESULT: 'APP',
              STANDALONE_RESULT: 'SITES',
            };
      for (const [dependency, area] of Object.entries(dependencies)) {
        for (const flag of ['false', 'true', '', 'unknown']) {
          for (const result of ['success', 'skipped', 'failure', 'cancelled', '']) {
            const env = {
              ...process.env,
              ...Object.fromEntries(results.map((key) => [key, 'success'])),
              APP: 'false',
              SITES: 'false',
              HANDWRITING: 'false',
              PYTHON: 'false',
              ELECTRON: 'false',
              [dependency]: result,
              [area]: flag,
              GITHUB_STEP_SUMMARY: join(directory, 'summary'),
            };
            const execution = spawnSync('bash', ['-e', '-c', step.run], { env, encoding: 'utf8' });
            assert.equal(
              execution.status,
              result === 'success' || (result === 'skipped' && flag === 'false') ? 0 : 1,
              `${job} ${dependency} ${flag} ${result}`,
            );
          }
        }
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('controlled path fixtures select the expected existing worker jobs', () => {
  const workers = [
    'typecheck',
    'lint',
    'test-unit',
    'test-coverage',
    'python-tools',
    'handwriting',
    'relay',
    'ai-mcp',
    'web-build',
    'production',
    'browser-pr',
    'browser-tests',
    'browser-standalone',
    'browser-timing',
    'electron-renderer',
    'electron-ai-tests',
    'windows-installed-upgrade',
    'electron-macos-smoke',
  ];
  // Pull requests run the browser smoke job; master commits retain the full browser suites.
  const postMerge = ['browser-tests', 'browser-standalone', 'browser-timing'];
  const web = ['web-build', 'production', 'browser-pr'];
  const all = workers.filter((name) => !postMerge.includes(name));
  for (const [paths, expected] of [
    [['docs/README.md'], []],
    [
      ['apps/relay/src/relay.ts'],
      ['typecheck', 'test-unit', 'test-coverage', 'relay', 'ai-mcp', ...web],
    ],
    [['tooling/handwriting-maths/src/main.ts'], ['lint', 'handwriting']],
    [['tooling/short-term-memory/stm_harness/contract.py'], ['lint', 'python-tools']],
    [['apps/library/index.html'], ['lint', ...web]],
    [['tests/e2e/study-flip.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/mobile-pwa-smoke.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/gaps-standalone.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/fixtures/videoEmbeds.ts'], all],
    [['tests/config/playwright.web.config.ts'], workers],
    [['tests/e2e/study-flip.spec.ts', 'apps/web/src/App.tsx'], all],
    [
      ['docs/README.md', 'apps/gaps/sw.js', 'tooling/handwriting-maths/src/main.ts'],
      ['lint', 'handwriting', ...web],
    ],
    [['apps/web/src/fsrs/coefficients/model.json'], all],
    [['apps/relay/shared/insights/index.ts'], all],
    [['apps/library/vercel.json'], all],
    [['.github/workflows/ci.yml'], workers],
    [['unknown/file'], all],
  ]) {
    const outputs = Object.fromEntries(
      Object.entries(classifyPaths(paths)).map(([key, value]) => [key, String(value)]),
    );
    const context = {
      github: { event_name: 'pull_request' },
      needs: { changes: { result: 'success', outputs } },
    };
    const selected = workers.filter((name) => {
      const job = workflow.jobs[name];
      const predicate = required.includes(name) ? job.steps[1].if : job.if;
      return runInNewContext(predicate, context);
    });
    assert.deepEqual(selected.sort(), [...expected].sort(), paths.join(', '));
  }
  const push = Object.fromEntries(
    Object.entries(classifyPaths(['unknown/file'])).map(([key, value]) => [key, String(value)]),
  );
  const selected = workers.filter((name) => {
    const job = workflow.jobs[name];
    const predicate = required.includes(name) ? job.steps[1].if : job.if;
    return runInNewContext(predicate, {
      github: { event_name: 'push' },
      needs: { changes: { result: 'success', outputs: push } },
    });
  });
  assert.deepEqual(selected.sort(), workers.filter((name) => name !== 'browser-pr').sort());
  for (const browser_ci of [undefined, '', 'unknown']) {
    for (const name of postMerge) {
      assert.ok(
        runInNewContext(workflow.jobs[name].if, {
          github: { event_name: 'pull_request' },
          needs: { changes: { outputs: { app: 'true', sites: 'true', browser_ci } } },
        }),
        `${name} for browser_ci=${browser_ci}`,
      );
    }
  }
});

test('Windows evidence is selected conservatively on PRs and pushes', () => {
  const gate = workflow.jobs['electron-ai'];
  const ai = workflow.jobs['electron-ai-tests'];
  const upgrade = workflow.jobs['windows-installed-upgrade'];
  const renderer = workflow.jobs['electron-renderer'];
  assert.equal(gate.name, 'electron-ai');
  assert.deepEqual(gate.needs, [
    'changes',
    'electron-renderer',
    'electron-ai-tests',
    'windows-installed-upgrade',
  ]);
  assert.equal(gate['runs-on'], 'ubuntu-latest');
  assert.equal(ai['runs-on'], 'windows-latest');
  assert.equal(ai.needs, 'changes');
  assert.equal(upgrade.needs, 'changes');
  for (const event_name of ['pull_request', 'push']) {
    for (const flag of ['true', 'false', '', undefined, 'unknown']) {
      const context = {
        github: { event_name },
        needs: { changes: { outputs: { windows_native: flag } } },
        always: () => true,
      };
      const affected = flag !== 'false';
      assert.equal(runInNewContext(renderer.if, context), affected);
      assert.equal(runInNewContext(ai.if, context), affected);
      assert.equal(runInNewContext(upgrade.if, context), affected);
    }
  }
});

test('required Windows check rejects absent or failed renderer, AI or installer evidence', () => {
  const job = workflow.jobs['electron-ai'];
  assert.equal(
    render(job.if, 'synchronize', {}, true),
    'true',
    'A cancelled dependency must not turn the required check into a successful skip',
  );
  const step = job.steps.find((step) => step.name === 'Require Windows AI and installer evidence');
  for (const status of ['failure', 'cancelled', 'skipped', '']) {
    const execution = spawnSync('bash', ['-e', '-c', step.run], {
      env: {
        ...process.env,
        SCOPE_RESULT: status,
        WINDOWS_NATIVE: 'false',
        RENDERER_RESULT: 'skipped',
        AI_RESULT: 'skipped',
        UPGRADE_RESULT: 'skipped',
      },
    });
    assert.notEqual(execution.status, 0, `Scope result: ${status}`);
  }
  for (const flag of ['false', 'true', '', 'unknown']) {
    for (const result of ['success', 'skipped', 'failure', 'cancelled', '']) {
      for (const dependency of ['RENDERER_RESULT', 'AI_RESULT', 'UPGRADE_RESULT']) {
        const execution = spawnSync('bash', ['-e', '-c', step.run], {
          env: {
            ...process.env,
            SCOPE_RESULT: 'success',
            WINDOWS_NATIVE: flag,
            RENDERER_RESULT: 'success',
            AI_RESULT: 'success',
            UPGRADE_RESULT: 'success',
            [dependency]: result,
          },
        });
        assert.equal(
          execution.status,
          result === 'success' || (flag === 'false' && result === 'skipped') ? 0 : 1,
          `${dependency}=${result} with windows_native=${flag}`,
        );
      }
    }
  }
});

test('site-only production runs the existing build, hosting and asset contracts', () => {
  const step = workflow.jobs.production.steps.find(
    (step) => step.name === 'Verify standalone site contracts',
  );
  assert.equal(
    step.run,
    'bun run test -- apps/web/src/build apps/web/src/release/pwaAssets.test.ts apps/web/src/vercelConfig.test.ts',
  );
  for (const [app, sites, expected] of [
    ['false', 'true', true],
    ['true', 'true', false],
    ['false', 'false', false],
  ]) {
    assert.equal(
      runInNewContext(step.if, { needs: { changes: { outputs: { app, sites } } } }),
      expected,
    );
  }
});

test('Electron AI evidence survives native failures without widening execution scope', () => {
  const job = workflow.jobs['electron-ai-tests'];
  const steps = job.steps;
  const evidence = steps.find((step) => step.name === 'Preserve Electron AI test evidence');
  assert.equal(evidence.if, 'always()');
  assert.equal(evidence.uses, 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9');
  assert.deepEqual(evidence.with, {
    name: 'electron-ai-results',
    path: 'test-results/',
    'if-no-files-found': 'ignore',
  });
  const nativeTest = steps.findIndex((step) => step.run === 'bun run test:e2e:electron-ai');
  assert.notEqual(nativeTest, -1);
  assert.ok(steps.indexOf(evidence) > nativeTest);
});

test('Windows upgrade scenarios retain both probes on isolated runners with the release package audit', () => {
  const job = workflow.jobs['windows-installed-upgrade'];
  assert.equal(job['runs-on'], 'windows-latest');
  assert.ok(job.strategy?.matrix, 'Both upgrade scenarios require isolated matrix runners');
  assert.equal(job.strategy['fail-fast'], false);
  assert.deepEqual(job.strategy.matrix.probe, ['companion', 'release']);
  const native = job.steps.findIndex((step) => step.run === 'bun run electron:prepare');
  const wait = job.steps.findIndex((step) => step.run === 'node scripts/ci-wait-for-renderer.mjs');
  const download = job.steps.findIndex(
    (step) => step.with?.name === 'windows-electron-renderer-${{ steps.renderer.outputs.attempt }}',
  );
  const upgrade = job.steps.findIndex(
    (step) => step.run === 'node scripts/windows-ci-upgrade.mjs ${{ matrix.probe }}',
  );
  assert.ok(native !== -1 && native < wait && wait < download && download < upgrade);
  assert.equal(job.steps[wait].id, 'renderer');
  assert.equal(
    job.steps[wait].env.SOURCE_SHA,
    '${{ github.event.pull_request.head.sha || github.sha }}',
  );
  assert.equal(job.steps[download].with.path, 'dist/');
  const producer = workflow.jobs['electron-renderer'].steps.find((step) =>
    step.uses?.startsWith('actions/upload-artifact@'),
  );
  assert.equal(producer.with.name, 'windows-electron-renderer-${{ github.run_attempt }}');
  assert.equal(producer.with.overwrite, undefined);
  const evidence = job.steps.find((step) => step.name === 'Preserve installed upgrade evidence');
  assert.equal(evidence.if, 'always()');
  assert.equal(evidence.with.name, 'windows-installed-upgrade-results-${{ matrix.probe }}');
  const coordinator = readFileSync(new URL('./windows-ci-upgrade.mjs', import.meta.url), 'utf8');
  for (const contract of [
    "'electron-builder'",
    "'nsis'",
    "'--x64'",
    "'perf:check:electron-package'",
    "'./windows-upgrade-companion.mjs'",
    "'./windows-release-upgrade.mjs'",
  ]) {
    assert.ok(coordinator.includes(contract), contract);
  }
});

test('an upgrade needs a positive package audit signal only when orchestrated by CI', async () => {
  const env = { LACUNA_CI_UPGRADE_PIPE: '1' };
  await requireAuditedInstaller(Readable.from([]), {});
  await requireAuditedInstaller(Readable.from(['audited installer ', 'ready\n']), env);
  for (const input of [[], ['audited installer ready'], ['unexpected']]) {
    await assert.rejects(
      requireAuditedInstaller(Readable.from(input), env),
      /candidate installer build or package audit failed/,
    );
  }
});

test('narrow web specs remain registered with the selected browser projects and typecheck', () => {
  const specs = readdirSync('tests/e2e').filter((file) => file.endsWith('.spec.ts'));
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-web-registration-'));
  try {
    mkdirSync(join(directory, 'tests/config'), { recursive: true });
    mkdirSync(join(directory, 'tests/e2e'));
    mkdirSync(join(directory, 'scripts'));
    copyFileSync(
      'scripts/browser-ci-summary.mjs',
      join(directory, 'scripts/browser-ci-summary.mjs'),
    );
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    symlinkSync(resolve('node_modules'), join(directory, 'node_modules'), 'dir');
    // Register the real entry-point names without executing their build/fixture side effects.
    for (const spec of specs)
      writeFileSync(
        join(directory, 'tests/e2e', spec),
        "import { test } from '@playwright/test'; test('registration', () => {});\n",
      );
    const registered = new Set();
    for (const config of ['playwright.web.config.ts', 'playwright.web.ci.config.ts']) {
      copyFileSync(join('tests/config', config), join(directory, 'tests/config', config));
      const result = spawnSync(
        process.execPath,
        [
          resolve('node_modules/@playwright/test/cli.js'),
          'test',
          '-c',
          join(directory, 'tests/config', config),
          '--list',
          '--reporter=json',
        ],
        {
          env: { ...process.env, CI: 'true' },
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.errors, []);
      for (const suite of report.suites) registered.add(suite.file);
    }
    for (const spec of specs) {
      if (spec === 'mobile-pwa-smoke.spec.ts') continue;
      assert.ok(registered.has(spec), spec);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const typecheck = JSON.parse(readFileSync('tsconfig.release-tooling.json', 'utf8'));
  assert.ok(typecheck.include.includes('tests/e2e/**/*.ts'));
  const projects = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  assert.ok(
    projects.references.some((project) => project.path === './tsconfig.release-tooling.json'),
  );
});

test('web spec scope is wired through metadata and fails closed for missing typecheck flags', () => {
  assert.equal(workflow.jobs.changes.outputs.web_tests, '${{ steps.scope.outputs.web_tests }}');
  const steps = workflow.jobs.typecheck.steps;
  for (const flag of ['false', 'true', '', 'unknown']) {
    const context = { needs: { changes: { outputs: { app: 'false', web_tests: flag } } } };
    assert.equal(runInNewContext(steps[0].if, context), flag === 'false');
    for (const step of steps.slice(1))
      assert.equal(runInNewContext(step.if, context), flag !== 'false');
  }
});

test('web spec aggregate gates retain every browser result and allow only unaffected unit/native jobs to skip', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-web-gates-'));
  try {
    const scope = classifyPaths(['tests/e2e/study-flip.spec.ts']);
    for (const name of ['test', 'browser-smoke'])
      for (const { event, browserCI, ignored } of gateCases(name)) {
        const step = workflow.jobs[name].steps[0];
        const results = Object.keys(step.env).filter(
          (key) => key.endsWith('RESULT') && !ignored.includes(key),
        );
        const env = {
          ...process.env,
          ...Object.fromEntries(
            Object.entries(scope).map(([key, value]) => [key.toUpperCase(), String(value)]),
          ),
          ...Object.fromEntries(ignored.map((key) => [key, 'skipped'])),
          ...Object.fromEntries(results.map((key) => [key, 'success'])),
          EVENT_NAME: event,
          BROWSER_CI: browserCI ?? '',
          GITHUB_STEP_SUMMARY: join(directory, 'summary'),
        };
        if (name === 'test')
          Object.assign(env, {
            UNIT_RESULT: 'skipped',
            COVERAGE_RESULT: 'skipped',
            HANDWRITING_RESULT: 'skipped',
            PYTHON_RESULT: 'skipped',
            MACOS_ELECTRON_RESULT: 'skipped',
          });
        const run = (overrides = {}) =>
          spawnSync('bash', ['-e', '-c', step.run], {
            encoding: 'utf8',
            env: { ...env, ...overrides },
          });
        assert.equal(run().status, 0, `${name} ${event}`);
        for (const key of results) {
          for (const status of ['failure', 'cancelled', ''])
            assert.equal(run({ [key]: status }).status, 1, `${name} ${key} ${status}`);
          if (env[key] === 'success')
            assert.equal(run({ [key]: 'skipped' }).status, 1, `${name} ${key} skipped`);
        }
      }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('push scope still selects the full matrix regardless of changed web specs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-push-scope-'));
  try {
    const step = workflow.jobs.changes.steps.find((step) => step.id === 'scope');
    const output = join(directory, 'output');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
      encoding: 'utf8',
      env: { ...process.env, EVENT_NAME: 'push', GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('=')),
    );
    assert.equal(outputs.docs_only, 'false');
    assert.equal(outputs.browser_ci, 'false');
    for (const [area, value] of Object.entries(outputs))
      if (!['docs_only', 'browser_ci'].includes(area)) assert.equal(value, 'true', area);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release prerequisites match CI and Security runs by workflow file, not run name', () => {
  // ci.yml and security.yml set run-name with the commit, so a run's name never equals the workflow's.
  for (const name of ['release-tag.yml', 'release.yml']) {
    const text = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    assert.match(text, /for workflow in ci security; do/, name);
    assert.match(text, /\.path == \$path/, name);
    assert.doesNotMatch(text, /\.name == \$workflow/, name);
  }
});

test('master push cancellation leaves scheduled security and retries isolated', () => {
  const security = parse(readFileSync('.github/workflows/security.yml', 'utf8'));
  assert.equal(render(security.concurrency.group, undefined), 'security-refs/heads/master');
  assert.equal(render(security.concurrency['cancel-in-progress'], undefined), 'true');
  assert.equal(render(security.concurrency['cancel-in-progress'], 'synchronize'), 'false');
  assert.equal(render(security.concurrency.group, undefined, {}, false, 2), 'security-retry-9001');
  assert.equal(
    render(security.concurrency['cancel-in-progress'], undefined, {}, false, 2),
    'false',
  );
});

test('recovery bootstraps only after API inspection finds incomplete records', () => {
  const recovery = parse(readFileSync('.github/workflows/ci-recovery.yml', 'utf8'));
  const [probe, ...steps] = recovery.jobs.recover.steps;
  assert.equal(probe.id, 'stale');
  assert.match(probe.run, /gh api/);
  assert.doesNotMatch(probe.run, /bun install|checkout|setup-node/);
  for (const step of steps) assert.equal(step.if, "steps.stale.outputs.found == 'true'");
});
