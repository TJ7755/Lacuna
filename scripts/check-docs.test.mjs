import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFileLinks, checkRetiredPaths } from './check-docs.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
function fixture(text) {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna-docs-'));
  directories.push(directory);
  mkdirSync(join(directory, 'docs'));
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src', 'with space.ts'), '');
  writeFileSync(join(directory, 'docs', 'guide.md'), text);
  return directory;
}

test('checks source pointers, images and reference definitions with line numbers', () => {
  const directory = fixture(
    '[source](../src/with%20space.ts#L1)\n![capture](missing.png)\n[owner]: ../src/gone.ts\n',
  );
  assert.deepEqual(checkFileLinks(directory, ['docs/guide.md']), [
    'docs/guide.md:2: missing repository target missing.png',
    'docs/guide.md:3: missing repository target ../src/gone.ts',
  ]);
});

test('ignores examples and external URLs while retaining checks after fenced code', () => {
  const directory = fixture(
    '```md\n[example](missing.md)\n```\n`[inline](missing.md)`\n[web](https://example.com/x)\n[mail](mailto:a@example.com)\n[section](#here)\n[local](../src/missing.ts)',
  );
  assert.deepEqual(checkFileLinks(directory, ['docs/guide.md']), [
    'docs/guide.md:8: missing repository target ../src/missing.ts',
  ]);
});

test('supports angle paths and repository-root links; rejects escapes and malformed encoding', () => {
  const directory = fixture(
    '[space](<../src/with space.ts>)\n[root](/src/with%20space.ts)\n[escape](../../outside.md)\n[bad](bad%XX.md)',
  );
  assert.deepEqual(checkFileLinks(directory, ['docs/guide.md']), [
    'docs/guide.md:3: missing repository target ../../outside.md',
    'docs/guide.md:4: invalid URL escape in bad%XX.md',
  ]);
});

test('skips deleted documents', () => {
  const directory = fixture('');
  assert.deepEqual(checkFileLinks(directory, ['docs/deleted.md']), []);
});

test('rejects review captures and change fragments committed under docs', () => {
  assert.deepEqual(
    checkRetiredPaths([
      'docs/review/853-question-progress/before.png',
      'docs/changes/unreleased/838.md',
      'docs/review-evidence/trial/README.md',
      'docs/reviewing.md',
      'docs/images/logo.png',
    ]),
    [
      'docs/review/853-question-progress/before.png: attach PR evidence and change notes to the pull request instead',
      'docs/changes/unreleased/838.md: attach PR evidence and change notes to the pull request instead',
      'docs/review-evidence/trial/README.md: attach PR evidence and change notes to the pull request instead',
    ],
  );
});
