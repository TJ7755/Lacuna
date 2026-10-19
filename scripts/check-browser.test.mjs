import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewBrowser, verifyBrowser } from './check-browser.mjs';

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

test('rejects output and reporter overrides before starting verification', () => {
  for (const args of [
    ['--output', 'test-results'],
    ['--output=test-results'],
    ['--reporter', 'line'],
    ['--reporter=line'],
  ]) {
    assert.throws(() => verifyBrowser({ args }), /owns its isolated/);
  }
});

test('starts the preview with structured arguments and preserves its exit status', () => {
  const directory = fixture();
  const env = {
    LACUNA_BROWSER_RUN_DIR: join(directory, "a path with spaces & 'quotes'"),
    PLAYWRIGHT_WEB_PORT: '4198',
  };
  const status = previewBrowser({
    directory,
    env,
    execute: (command, args, options) => {
      assert.equal(command, 'bun');
      assert.deepEqual(args, [
        'x',
        'vite',
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4198',
        '--strictPort',
        '--outDir',
        join(env.LACUNA_BROWSER_RUN_DIR, 'dist'),
      ]);
      assert.equal(options.cwd, directory);
      assert.equal(options.env, env);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.shell, false);
      return { status: 19 };
    },
  });
  assert.equal(status, 19);
});

test('does not inherit shared reporter destinations or reporter replacement', () => {
  const directory = fixture();
  const overrides = [
    'PLAYWRIGHT_HTML_OUTPUT_DIR',
    'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_JSON_OUTPUT_FILE',
    'PLAYWRIGHT_JSON_OUTPUT_DIR',
    'PLAYWRIGHT_JSON_OUTPUT_NAME',
    'PLAYWRIGHT_LAST_RUN_OUTPUT_FILE',
    'PW_TEST_REPORTER',
  ];
  const env = Object.fromEntries(overrides.map((key) => [key, 'shared-output']));
  env.PATH = 'preserved-path';
  assert.equal(
    verifyBrowser({
      directory,
      env,
      execute: (_command, args, options) => {
        for (const key of overrides) assert.equal(options.env[key], undefined);
        assert.equal(options.env.PATH, 'preserved-path');
        assert.equal(options.env.PLAYWRIGHT_HTML_OPEN, 'never');
        if (args[0] === 'run') build(args);
        return { status: 0 };
      },
    }),
    0,
  );
  assert.equal(env.PW_TEST_REPORTER, 'shared-output');
});

test('selects the isolated Gaps build and removes its selector before Playwright', () => {
  const directory = fixture();
  assert.equal(
    verifyBrowser({
      directory,
      args: ['--gaps', '--project=chromium'],
      execute: (_command, args, options) => {
        assert.equal(options.env.LACUNA_BROWSER_SITE, 'gaps');
        if (args[0] === 'run') {
          assert.equal(args[1], 'build:gaps:assets');
          build(args);
        } else {
          assert.ok(!args.includes('--gaps'));
          assert.ok(args.includes('--project=chromium'));
        }
        return { status: 0 };
      },
    }),
    0,
  );
  assert.equal(evidence(directory)[0].site, 'gaps');
});

test('previews Gaps with its own root and config', () => {
  previewBrowser({
    env: { LACUNA_BROWSER_RUN_DIR: '/isolated/run', LACUNA_BROWSER_SITE: 'gaps' },
    execute: (_command, args) => {
      assert.deepEqual(args.slice(0, 5), [
        'x',
        'vite',
        'preview',
        '--config',
        'vite.gaps.config.ts',
      ]);
      assert.equal(args[args.indexOf('--outDir') + 1], '/isolated/run/dist');
      return { status: 0 };
    },
  });
});
