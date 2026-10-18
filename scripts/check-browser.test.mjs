import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBrowser } from './check-browser.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lacuna browser-'));
  directories.push(directory);
  const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'ignore' });
  git('init');
  writeFileSync(join(directory, '.gitignore'), 'artifacts/\n');
  writeFileSync(join(directory, 'source.txt'), 'before');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-m',
    'fixture',
  );
  return directory;
}
function evidence(directory) {
  const parent = join(directory, 'artifacts', 'browser-checks');
  return readdirSync(parent).map((name) =>
    JSON.parse(readFileSync(join(parent, name, 'source.json'), 'utf8')),
  );
}
function build(args) {
  const output = args[args.indexOf('--outDir') + 1];
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'index.html'), '<html>fixed build</html>');
}

test('isolates repeated runs and propagates a Playwright failure with source identity', () => {
  const directory = fixture();
  const outputs = [];
  const execute = (_command, args, options) => {
    if (args[0] === 'run') {
      build(args);
      outputs.push(args[args.indexOf('--outDir') + 1]);
    } else {
      assert.equal(args[args.indexOf('-c') + 1], 'tests/config/playwright.web.isolated.config.ts');
      assert.ok(options.env.LACUNA_BROWSER_RUN_DIR);
      return { status: 17 };
    }
    return { status: 0 };
  };
  assert.equal(verifyBrowser({ directory, args: ['--project=chromium'], execute }), 17);
  assert.equal(verifyBrowser({ directory, execute }), 17);
  assert.notEqual(outputs[0], outputs[1]);
  for (const report of evidence(directory)) {
    assert.match(report.source.commit, /^[a-f0-9]{40}$/);
    assert.match(report.indexSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.exitCode, 17);
  }
});

test('a failed build never starts browser tests', () => {
  const directory = fixture();
  let calls = 0;
  assert.equal(
    verifyBrowser({
      directory,
      execute: () => {
        calls++;
        return { status: 9 };
      },
    }),
    9,
  );
  assert.equal(calls, 1);
  assert.equal(evidence(directory)[0].exitCode, 9);
});

test('rejects a changed candidate even if browser tests report success', () => {
  const directory = fixture();
  assert.equal(
    verifyBrowser({
      directory,
      execute: (_command, args) => {
        if (args[0] === 'run') build(args);
        else writeFileSync(join(directory, 'source.txt'), 'changed');
        return { status: 0 };
      },
    }),
    1,
  );
  assert.match(evidence(directory)[0].error, /Source changed during verification/);
});

test('does not accept a configuration override which would bypass isolation', () => {
  assert.throws(
    () => verifyBrowser({ args: ['--config=other.ts'] }),
    /owns its isolated configuration/,
  );
});
