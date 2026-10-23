import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    assert.match(readFileSync(join(directory, 'watch'), 'utf8'), /--interval 60/);
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
    assert.equal(acknowledgement.if, name === 'production' ? "(needs.changes.outputs.app == 'false' && needs.changes.outputs.sites == 'false')" : `needs.changes.outputs.${({ 'ai-mcp': 'ai_mcp', 'electron-ai': 'electron', typecheck: 'app' })[name] ?? name} == 'false'`, name);
    assert.equal(acknowledgement.shell, 'bash', name);
    assert.ok(acknowledgement.run.includes('GITHUB_STEP_SUMMARY'), name);
    assert.ok(heavySteps.length > 0, name);
    for (const step of heavySteps.filter((step) => step.name !== 'Verify standalone site contracts' && !(name === 'electron-ai' && step.name === 'Preserve Electron AI test evidence'))) {
      assert.equal(
        step.if,
        name === 'production' ? "(needs.changes.outputs.app != 'false' || needs.changes.outputs.sites != 'false')" : `needs.changes.outputs.${({ 'ai-mcp': 'ai_mcp', 'electron-ai': 'electron', typecheck: 'app' })[name] ?? name} != 'false'`,
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
          APP: 'true', SITES: 'true', ELECTRON: 'true', HANDWRITING: 'true', PYTHON: 'true',
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
      assert.equal(run({ ...docs, APP: 'false', SITES: 'false', ELECTRON: 'false', HANDWRITING: 'false', PYTHON: 'false' }).status, 0);
      assert.equal(run({ ...docs, APP: 'false', SITES: 'false', ELECTRON: 'false', HANDWRITING: 'false', PYTHON: 'false', SCOPE_RESULT: 'failure' }).status, 1);
      for (const key of Object.keys(docs)) {
        assert.equal(run({ ...docs, APP: 'false', SITES: 'false', ELECTRON: 'false', HANDWRITING: 'false', PYTHON: 'false', [key]: 'failure' }).status, 1);
        assert.equal(run({ ...docs, APP: 'false', SITES: 'false', ELECTRON: 'false', HANDWRITING: 'false', PYTHON: 'false', [key]: 'cancelled' }).status, 1);
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
    assert.ok(job.needs.includes('production'));
    const download = job.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'));
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
  const security = parse(readFileSync(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8'));
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
      const dependencies = job === 'test'
        ? { UNIT_RESULT: 'APP', COVERAGE_RESULT: 'APP', HANDWRITING_RESULT: 'HANDWRITING', PYTHON_RESULT: 'PYTHON', MACOS_ELECTRON_RESULT: 'ELECTRON' }
        : { RESULT: 'APP', TIMING_RESULT: 'APP', MOBILE_RESULT: 'APP', STANDALONE_RESULT: 'SITES' };
      for (const [dependency, area] of Object.entries(dependencies)) {
        for (const flag of ['false', 'true', '', 'unknown']) {
          for (const result of ['success', 'skipped', 'failure', 'cancelled', '']) {
            const env = { ...process.env, ...Object.fromEntries(results.map((key) => [key, 'success'])),
              APP: 'false', SITES: 'false', HANDWRITING: 'false', PYTHON: 'false', ELECTRON: 'false',
              [dependency]: result, [area]: flag, GITHUB_STEP_SUMMARY: join(directory, 'summary') };
            const execution = spawnSync('bash', ['-e', '-c', step.run], { env, encoding: 'utf8' });
            assert.equal(execution.status, result === 'success' || (result === 'skipped' && flag === 'false') ? 0 : 1, `${job} ${dependency} ${flag} ${result}`);
          }
        }
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


test('controlled path fixtures select the expected existing worker jobs', () => {
  const workers = ['typecheck', 'lint', 'test-unit', 'test-coverage', 'python-tools', 'handwriting', 'relay', 'ai-mcp', 'production', 'browser-tests', 'browser-standalone', 'browser-timing', 'browser-mobile', 'electron-ai', 'electron-macos-smoke', 'windows-installed-upgrade'];
  const web = ['production', 'browser-tests', 'browser-standalone', 'browser-timing', 'browser-mobile'];
  for (const [paths, expected] of [
    [['docs/README.md'], []],
    [['relay/src/relay.ts'], ['typecheck', 'test-unit', 'test-coverage', 'relay', 'ai-mcp', ...web]],
    [['tooling/handwriting-maths/src/main.ts'], ['lint', 'handwriting']],
    [['tooling/short-term-memory/stm_harness/contract.py'], ['lint', 'python-tools']],
    [['library/index.html'], ['lint', ...web]],
    [['docs/README.md', 'gaps/sw.js', 'tooling/handwriting-maths/src/main.ts'], ['lint', 'handwriting', ...web]],
    [['src/fsrs/coefficients/model.json'], workers],
    [['relay/shared/insights/index.ts'], workers],
    [['library/vercel.json'], workers],
    [['unknown/file'], workers],
  ]) {
    const outputs = Object.fromEntries(Object.entries(classifyPaths(paths)).map(([key, value]) => [key, String(value)]));
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
  const step = workflow.jobs.production.steps.find((step) => step.name === 'Verify standalone site contracts');
  assert.equal(step.run, 'bun run test -- src/build src/release/pwaAssets.test.ts src/vercelConfig.test.ts');
  for (const [app, sites, expected] of [['false', 'true', true], ['true', 'true', false], ['false', 'false', false]]) {
    assert.equal(runInNewContext(step.if, { needs: { changes: { outputs: { app, sites } } } }), expected);
  }
});


test('Electron AI evidence survives native failures without widening execution scope', () => {
  const steps = workflow.jobs['electron-ai'].steps;
  const evidence = steps.find((step) => step.name === 'Preserve Electron AI test evidence');
  assert.equal(evidence.if, "always() && needs.changes.outputs.electron != 'false'");
  assert.equal(evidence.uses, 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9');
  assert.deepEqual(evidence.with, {
    name: 'electron-ai-results', path: 'test-results/', 'if-no-files-found': 'ignore',
  });
  const nativeTest = steps.findIndex((step) => step.run === 'bun run test:e2e:electron-ai');
  assert.notEqual(nativeTest, -1);
  assert.ok(steps.indexOf(evidence) > nativeTest);
});
