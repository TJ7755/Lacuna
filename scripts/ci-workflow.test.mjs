import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

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
function render(value, action, changes = {}, cancelled = false) {
  const context = {
    github: {
      event_name: action ? 'pull_request' : 'push',
      run_id: 9001,
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

test('metadata edits resolve distinct contexts without cancelling CI or running validation', () => {
  for (const changes of [
    { title: { from: 'Old title' } },
    { body: { from: null } },
    { title: {}, body: {} },
  ]) {
    assert.equal(render(workflow.concurrency.group, 'edited', changes), 'ci-metadata-9001');
    assert.equal(render(workflow.concurrency['cancel-in-progress'], 'edited', changes), 'false');
    assert.equal(workflow.jobs.changes.if, undefined);
    assert.equal(render(workflow.jobs.documentation.if, 'edited', changes), 'false');
    const metadata = workflow.jobs.changes.steps.find((step) => step.id === 'metadata');
    assert.equal(render(metadata.if, 'edited', changes), 'true');
    assert.match(metadata.run, /docs_only=true/);
    for (const step of workflow.jobs.changes.steps.filter((step) => step.id !== 'metadata')) {
      assert.equal(render(step.if, 'edited', changes), 'false', step.id ?? step.uses);
    }
    for (const job of ['test', 'browser-smoke']) {
      assert.equal(render(workflow.jobs[job].if, 'edited', changes), 'true', job);
      assert.equal(render(workflow.jobs[job].steps[0].if, 'edited', changes), 'false', job);
    }
    for (const job of required) {
      assert.equal(render(workflow.jobs[job].name, 'edited', changes), `metadata-${job}`);
    }
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
    assert.equal(acknowledgement.if, "needs.changes.outputs.docs_only == 'true'", name);
    assert.equal(acknowledgement.shell, 'bash', name);
    assert.ok(acknowledgement.run.includes('GITHUB_STEP_SUMMARY'), name);
    assert.ok(heavySteps.length > 0, name);
    for (const step of heavySteps) {
      assert.equal(
        step.if,
        "needs.changes.outputs.docs_only != 'true'",
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
          DOCS_ONLY: 'false',
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
      assert.equal(run({ ...docs, DOCS_ONLY: 'true' }).status, 0);
      assert.equal(run({ ...docs, DOCS_ONLY: 'true', SCOPE_RESULT: 'failure' }).status, 1);
      for (const key of Object.keys(docs)) {
        assert.equal(run({ ...docs, DOCS_ONLY: 'true', [key]: 'failure' }).status, 1);
        assert.equal(run({ ...docs, DOCS_ONLY: 'true', [key]: 'cancelled' }).status, 1);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
