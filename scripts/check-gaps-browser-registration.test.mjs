import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('runs the artefact labels regression in CI', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const spec = 'gaps-artefact-labels.spec.ts';

  assert.ok(/--gaps[^\n]*gaps-artefact-labels\.spec\.ts/.test(workflow), spec);
});
