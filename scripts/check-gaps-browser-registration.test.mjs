import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyPaths } from './ci-change-scope.mjs';

test('runs the artefact labels and demo regressions in standalone Gaps CI', () => {
  const { standalone_suites: suites } = classifyPaths(['apps/gaps/sw.js']);
  assert.deepEqual(
    suites.map(({ site }) => site),
    ['gaps'],
  );
  for (const spec of ['gaps-artefact-labels.spec.ts', 'gaps-demo.spec.ts']) {
    assert.ok(suites[0].specs.split(' ').includes(spec), spec);
  }
});
