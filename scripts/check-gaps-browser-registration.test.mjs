import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('runs the artefact labels and demo regressions in standalone Gaps CI', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const command = workflow.split('\n').find((line) => /command:.*--gaps/.test(line));
  assert.ok(command, 'standalone Gaps command');
  for (const spec of ['gaps-artefact-labels.spec.ts', 'gaps-demo.spec.ts']) {
    assert.ok(command.split(/\s+/).includes(spec), spec);
  }
});
