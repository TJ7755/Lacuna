import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { extractArchive, verifyArchive, verifyRevision } from '../relay/scripts/security-bun.mjs';

const root = new URL('../', import.meta.url);
const revision = readFileSync(new URL('.bun-version', root), 'utf8').trim();
const action = parse(readFileSync(new URL('.github/actions/setup-bun/action.yml', root), 'utf8'));

test('Windows ZIP extraction uses native tar rather than Git tar interpreting a drive as a host', () => {
  const calls = [];
  const directory = 'D:\\a\\Lacuna\\runtime download';
  extractArchive(directory, {
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    execute: (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [
    ['C:\\Windows\\System32\\tar.exe', ['-xf', 'bun.zip'], { cwd: directory }],
  ]);
});

test('the Bun security guard rejects changed downloads and unreviewed revisions', () => {
  assert.doesNotThrow(() => verifyRevision(revision));
  for (const installed of ['1.4.3+c6da4a4d3', '1.4.4-canary.1+unreviewed']) {
    assert.throws(() => verifyRevision(installed), /Bun revision mismatch/);
  }
  const archive = Buffer.from('reviewed download');
  const expected = createHash('sha256').update(archive).digest('hex');
  assert.doesNotThrow(() => verifyArchive(archive, expected));
  assert.throws(
    () => verifyArchive(Buffer.from('changed download'), expected),
    /checksum mismatch/,
  );
  assert.equal(action.runs.steps[0].run, 'node relay/scripts/security-bun.mjs --install');
});

test('every Bun workflow uses the security guard and manifests share its pin', () => {
  for (const file of readdirSync(new URL('.github/workflows/', root))) {
    if (!file.endsWith('.yml')) continue;
    const workflow = parse(readFileSync(new URL(`.github/workflows/${file}`, root), 'utf8'));
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        assert.ok(!step.uses?.startsWith('oven-sh/setup-bun@'), `${file} bypasses the Bun guard`);
        if (step.uses?.startsWith('actions/setup-node@')) {
          assert.equal(step.with['node-version'], '24.22.1', file);
        }
      }
    }
  }
  for (const file of [
    'package.json',
    'relay/package.json',
    'tooling/handwriting-maths/package.json',
  ]) {
    const manifest = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    assert.equal(manifest.packageManager, `bun@${revision}`, file);
  }
});

test('Vercel builds use the verified Bun bootstrap instead of vulnerable bunx downloads', () => {
  for (const file of [
    'vercel.json',
    'gaps/vercel.json',
    'library/vercel.json',
    'relay/vercel.json',
  ]) {
    const config = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    assert.match(
      config.installCommand,
      /node (?:relay\/)?scripts\/security-bun\.mjs install --frozen-lockfile/,
    );
    if (config.buildCommand)
      assert.match(config.buildCommand, /node relay\/scripts\/security-bun\.mjs run build/);
  }
  const pin = JSON.parse(readFileSync(new URL('relay/scripts/security-bun.json', root), 'utf8'));
  assert.equal(pin.revision, revision);
});
