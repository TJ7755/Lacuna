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
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { classifyPaths } from './ci-change-scope.mjs';

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

test('metadata edits reuse validation without cancelling CI or bypassing required contexts', () => {
  for (const changes of [
    { title: { from: 'Old title' } },
    { body: { from: null } },
    { title: {}, body: {} },
  ]) {
    assert.equal(render(workflow['run-name'], 'edited', changes), 'CI metadata push-sha');
    assert.equal(render(workflow.concurrency.group, 'edited', changes), 'ci-metadata-9001');
    assert.equal(render(workflow.concurrency['cancel-in-progress'], 'edited', changes), 'false');
    assert.equal(workflow.jobs.changes.if, undefined);
    assert.equal(render(workflow.jobs.documentation.if, 'edited', changes), 'false');
    const metadata = workflow.jobs.changes.steps.find((step) => step.id === 'metadata');
    assert.equal(render(metadata.if, 'edited', changes), 'true');
    assert.equal(metadata.env.VALIDATION_TITLE, 'CI validation ${{ github.sha }}');
    assert.equal(metadata.env.HEAD_SHA, '${{ github.event.pull_request.head.sha }}');
    assert.match(metadata.run, /head_sha=\$HEAD_SHA/);
    for (const step of workflow.jobs.changes.steps.filter((step) => step.id !== 'metadata')) {
      assert.equal(render(step.if, 'edited', changes), 'false', step.id ?? step.uses);
    }
    for (const job of ['test', 'browser-smoke']) {
      assert.equal(render(workflow.jobs[job].if, 'edited', changes), 'true', job);
      assert.equal(render(workflow.jobs[job].steps[0].if, 'edited', changes), 'false', job);
    }
    for (const job of required) {
      assert.equal(render(workflow.jobs[job].name, 'edited', changes), job);
    }
  }
});

test('metadata reuse requires a successful validation run for the exact merge commit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-reuse-'));
  try {
    const step = workflow.jobs.changes.steps.find((step) => step.id === 'metadata');
    const gh = join(directory, 'gh');
    writeFileSync(
      gh,
      `#!/bin/bash
if [ "$1" = api ] && [[ "$2" == *"/runs?"* ]]; then
  printf '%s' "$RUNS"
elif [ "$1" = api ]; then
  printf '%s' "$CONCLUSION"
else
  printf '%s\\n' "$*" > "$WATCH_ARGS"
  exit "$WATCH_STATUS"
fi
`,
      { mode: 0o755 },
    );
    const run = (runs, status = '0', conclusion = 'success') => {
      const output = join(directory, 'output');
      const summary = join(directory, 'summary');
      writeFileSync(output, '');
      writeFileSync(summary, '');
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GH_REPO: 'owner/repo',
          HEAD_SHA: 'head',
          VALIDATION_TITLE: 'CI validation current-merge',
          RUNS: JSON.stringify({ workflow_runs: runs }),
          WATCH_ARGS: join(directory, 'watch'),
          WATCH_STATUS: status,
          CONCLUSION: conclusion,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      });
      return { ...result, output: readFileSync(output, 'utf8') };
    };
    const valid = { id: 42, display_title: 'CI validation current-merge' };
    assert.equal(run([valid]).status, 0);
    assert.match(run([valid]).output, /^docs_only=true\napp=false\n/);
    assert.match(
      readFileSync(join(directory, 'watch'), 'utf8'),
      /run watch 42 --repo owner\/repo --exit-status/,
    );
    assert.match(readFileSync(join(directory, 'watch'), 'utf8'), /--interval 10/);
    for (const runs of [
      [],
      [{ id: 1, display_title: 'CI validation older-merge' }],
      [{ id: 2, display_title: 'CI metadata current-merge' }],
    ]) {
      const result = run(runs);
      assert.notEqual(result.status, 0);
      assert.equal(result.output, '');
    }
    for (const conclusion of ['skipped', 'neutral', 'cancelled', 'failure', '']) {
      const result = run([valid], '0', conclusion);
      assert.notEqual(result.status, 0);
      assert.equal(result.output, '');
    }
    const failed = run([valid], '1');
    assert.notEqual(failed.status, 0);
    assert.equal(failed.output, '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('metadata aggregate gates reject missing, failed or cancelled reuse', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-reuse-gates-'));
  try {
    for (const job of ['test', 'browser-smoke']) {
      const step = workflow.jobs[job].steps.find(
        (step) => step.name === 'Require successful reused validation',
      );
      for (const status of ['success', 'failure', 'cancelled', 'skipped', '']) {
        const result = spawnSync('bash', ['-e', '-c', step.run], {
          encoding: 'utf8',
          env: {
            ...process.env,
            SCOPE_RESULT: status,
            GITHUB_STEP_SUMMARY: join(directory, 'summary'),
          },
        });
        assert.equal(result.status, status === 'success' ? 0 : 1, `${job}: ${status}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('retargets, code events and unknown edits retain the real gates and concurrency', () => {
  assert.ok(workflow.on.pull_request.types.includes('edited'));
  for (const [action, changes] of [
    ['opened', {}],
    ['synchronize', {}],
    ['reopened', {}],
    ['ready_for_review', {}],
    ['edited', { base: { ref: { from: 'redesign/parent' } } }],
    ['edited', { base: { ref: { from: 'redesign/parent' } }, body: {} }],
    ['edited', {}],
    [undefined, {}],
  ]) {
    assert.equal(render(workflow['run-name'], action, changes), 'CI validation push-sha');
    assert.equal(
      render(workflow.concurrency.group, action, changes),
      action ? 'ci-42' : 'ci-push-sha',
    );
    assert.equal(
      render(workflow.concurrency['cancel-in-progress'], action, changes),
      String(Boolean(action)),
    );
    for (const job of ['documentation', 'test', 'browser-smoke']) {
      assert.equal(render(workflow.jobs[job].if, action, changes), 'true', job);
    }
    for (const job of required) assert.equal(render(workflow.jobs[job].name, action, changes), job);
  }
});

test('aggregate gates run after dependency failures but do not run after workflow cancellation', () => {
  for (const job of ['test', 'browser-smoke']) {
    assert.match(workflow.jobs[job].if, /always\(\)/);
    assert.equal(render(workflow.jobs[job].if, 'synchronize', {}, true), 'false');
    assert.equal(render(workflow.jobs[job].if, 'synchronize'), 'true');
  }
});

test('documentation-only changes resolve required names without running heavy steps', () => {
  for (const name of required.filter((name) => !['test', 'browser-smoke'].includes(name))) {
    const job = workflow.jobs[name];
    assert.equal(job.if, "needs.changes.result == 'success'", name);
    const [acknowledgement, ...heavySteps] = job.steps;
    assert.equal(
      acknowledgement.if,
      name === 'typecheck'
        ? "(needs.changes.outputs.app == 'false' && needs.changes.outputs.web_tests == 'false')"
        : name === 'production'
          ? "(needs.changes.outputs.app == 'false' && needs.changes.outputs.sites == 'false')"
          : `needs.changes.outputs.${{ 'ai-mcp': 'ai_mcp', 'electron-ai': 'electron', typecheck: 'app' }[name] ?? name} == 'false'`,
      name,
    );
    assert.equal(acknowledgement.shell, 'bash', name);
    assert.ok(acknowledgement.run.includes('GITHUB_STEP_SUMMARY'), name);
    assert.ok(heavySteps.length > 0, name);
    for (const step of heavySteps.filter(
      (step) =>
        step.name !== 'Verify standalone site contracts' &&
        !(name === 'electron-ai' && step.name === 'Preserve Electron AI test evidence'),
    )) {
      assert.equal(
        step.if,
        name === 'typecheck'
          ? "(needs.changes.outputs.app != 'false' || needs.changes.outputs.web_tests != 'false')"
          : name === 'production'
            ? "(needs.changes.outputs.app != 'false' || needs.changes.outputs.sites != 'false')"
            : `needs.changes.outputs.${{ 'ai-mcp': 'ai_mcp', 'electron-ai': 'electron', typecheck: 'app' }[name] ?? name} != 'false'`,
        `${name}: ${step.uses ?? step.run}`,
      );
    }
  }
});

test('aggregate shell gates fail closed and report each dependency result', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-ci-gates-'));
  try {
    for (const job of ['test', 'browser-smoke']) {
      const step = workflow.jobs[job].steps[0];
      const results = Object.keys(step.env).filter((key) => key.endsWith('RESULT'));
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
          GITHUB_STEP_SUMMARY: summary,
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
          assert.equal(result.status, 1, `${job}: ${key}=${status}`);
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

test('browser consumers use the same pinned browser image and shared production artefact', () => {
  const version = readFileSync(new URL('../bun.lock', import.meta.url), 'utf8').match(
    /"@playwright\/test": \["@playwright\/test@([^"\s]+)"/,
  )[1];
  const jobs = workflow.jobs;
  const consumers = ['browser-tests', 'browser-timing', 'browser-mobile'];
  const producer = jobs.production.steps.find((step) =>
    step.uses?.startsWith('actions/upload-artifact@'),
  );
  assert.ok(producer);
  for (const name of [...consumers, 'browser-standalone']) {
    assert.match(
      jobs[name].container.image,
      new RegExp(
        `^mcr\\.microsoft\\.com/playwright:v${version.replaceAll('.', '\\.')}\\-noble@sha256:[a-f0-9]{64}$`,
      ),
    );
    assert.ok(!jobs[name].steps.some((step) => /playwright install/.test(step.run ?? '')));
    assert.ok(jobs['browser-smoke'].needs.includes(name));
  }
  for (const name of consumers) {
    const job = jobs[name];
    assert.equal(job.needs, 'changes');
    const wait = job.steps.find((step) => step.run === 'node scripts/ci-wait-for-production.mjs');
    assert.equal(wait?.env.GH_TOKEN, '${{ github.token }}');
    assert.equal(wait?.env.SOURCE_SHA, '${{ github.event.pull_request.head.sha || github.sha }}');
    const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'));
    assert.ok(job.steps.indexOf(wait) < job.steps.indexOf(download));
    assert.equal(download.with.name, producer.with.name);
    assert.equal(download.with.path, producer.with.path);
    assert.equal(job.env.LACUNA_BROWSER_PREBUILT, 'true');
  }
  const timing = jobs['browser-timing'];
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
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
  assert.ok(
    jobs['browser-tests'].steps.some(
      (step) => step.run === 'node scripts/ci-browser-shards.mjs run ${{ matrix.shard }}/12',
    ),
  );
  const functionalEvidence = jobs['browser-tests'].steps.find(
    (step) => step.name === 'Preserve browser test evidence',
  );
  assert.equal(functionalEvidence.if, 'always()');
  assert.ok(functionalEvidence.with.path.split('\n').includes('artifacts/ci-browser-shards/'));
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
    (step) => step.run === 'node relay/scripts/security-bun.mjs --install',
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
  assert.equal(namespaces.size, 3);
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
              MOBILE_RESULT: 'APP',
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
    'production',
    'browser-tests',
    'browser-standalone',
    'browser-timing',
    'browser-mobile',
    'electron-ai',
    'electron-macos-smoke',
    'windows-installed-upgrade',
  ];
  const web = [
    'production',
    'browser-tests',
    'browser-standalone',
    'browser-timing',
    'browser-mobile',
  ];
  for (const [paths, expected] of [
    [['docs/README.md'], []],
    [
      ['relay/src/relay.ts'],
      ['typecheck', 'test-unit', 'test-coverage', 'relay', 'ai-mcp', ...web],
    ],
    [['tooling/handwriting-maths/src/main.ts'], ['lint', 'handwriting']],
    [['tooling/short-term-memory/stm_harness/contract.py'], ['lint', 'python-tools']],
    [['library/index.html'], ['lint', ...web]],
    [['tests/e2e/study-flip.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/mobile-pwa-smoke.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/gaps-standalone.spec.ts'], ['typecheck', 'lint', ...web]],
    [['tests/e2e/fixtures/videoEmbeds.ts'], workers],
    [['tests/config/playwright.web.config.ts'], workers],
    [['tests/e2e/study-flip.spec.ts', 'src/App.tsx'], workers],
    [
      ['docs/README.md', 'gaps/sw.js', 'tooling/handwriting-maths/src/main.ts'],
      ['lint', 'handwriting', ...web],
    ],
    [['src/fsrs/coefficients/model.json'], workers],
    [['relay/shared/insights/index.ts'], workers],
    [['library/vercel.json'], workers],
    [['unknown/file'], workers],
  ]) {
    const outputs = Object.fromEntries(
      Object.entries(classifyPaths(paths)).map(([key, value]) => [key, String(value)]),
    );
    const context = { needs: { changes: { result: 'success', outputs } } };
    const selected = workers.filter((name) => {
      const job = workflow.jobs[name];
      const predicate = required.includes(name) ? job.steps[1].if : job.if;
      return runInNewContext(predicate, context);
    });
    assert.deepEqual(selected.sort(), [...expected].sort(), paths.join(', '));
  }
});

test('site-only production runs the existing build, hosting and asset contracts', () => {
  const step = workflow.jobs.production.steps.find(
    (step) => step.name === 'Verify standalone site contracts',
  );
  assert.equal(
    step.run,
    'bun run test -- src/build src/release/pwaAssets.test.ts src/vercelConfig.test.ts',
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
  const steps = workflow.jobs['electron-ai'].steps;
  const evidence = steps.find((step) => step.name === 'Preserve Electron AI test evidence');
  assert.equal(evidence.if, "always() && needs.changes.outputs.electron != 'false'");
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
          ...(config === 'playwright.web.config.ts' ? ['--project=webkit-mobile'] : []),
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
    for (const spec of specs) assert.ok(registered.has(spec), spec);
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
  assert.equal(
    workflow.jobs.changes.outputs.web_tests,
    '${{ steps.metadata.outputs.web_tests || steps.scope.outputs.web_tests }}',
  );
  const metadata = workflow.jobs.changes.steps.find((step) => step.id === 'metadata');
  assert.match(metadata.run, /for area in .* web_tests; do/);
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
    for (const name of ['test', 'browser-smoke']) {
      const step = workflow.jobs[name].steps[0];
      const results = Object.keys(step.env).filter((key) => key.endsWith('RESULT'));
      const env = {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(scope).map(([key, value]) => [key.toUpperCase(), String(value)]),
        ),
        ...Object.fromEntries(results.map((key) => [key, 'success'])),
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
      assert.equal(run().status, 0, name);
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
    for (const [area, value] of Object.entries(outputs))
      if (area !== 'docs_only') assert.equal(value, 'true', area);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('web spec-only changes reduce heavy matrix instances from 37 to 22', () => {
  const count = (scope) => {
    const outputs = Object.fromEntries(
      Object.entries(scope).map(([key, value]) => [key, String(value)]),
    );
    const context = { needs: { changes: { result: 'success', outputs } } };
    let heavy = 0;
    let runners = 0;
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (['changes', 'documentation', 'test', 'browser-smoke'].includes(name)) {
        runners++;
        continue;
      }
      const matrix = job.strategy?.matrix;
      const instances = !matrix
        ? 1
        : (matrix.include?.length ??
          Object.values(matrix).reduce((total, values) => total * values.length, 1));
      const acknowledgement = required.includes(name);
      const selected = runInNewContext(acknowledgement ? job.steps[1].if : job.if, context);
      if (selected) heavy += instances;
      if (acknowledgement || selected) runners += instances;
    }
    return { heavy, runners };
  };
  assert.deepEqual(count(classifyPaths(['unknown/file'])), { heavy: 37, runners: 41 });
  assert.deepEqual(count(classifyPaths(['tests/e2e/study-flip.spec.ts'])), {
    heavy: 22,
    runners: 29,
  });
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
