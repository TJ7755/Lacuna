import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { pathToFileURL } from 'node:url';

const audited = 'audited installer ready\n';

export async function requireAuditedInstaller(input = process.stdin, env = process.env) {
  if (env.LACUNA_CI_UPGRADE_PIPE === '1') {
    assert.equal(
      await text(input),
      audited,
      'The candidate installer build or package audit failed',
    );
  }
}

function requireSuccessfulExit(child, command) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

function run(command, args, env) {
  return requireSuccessfulExit(spawn(command, args, { env, stdio: 'inherit' }), command);
}

async function buildInstaller(env) {
  await run(
    'bun',
    [
      'x',
      '--no-install',
      'electron-builder',
      '--win',
      'nsis',
      '--x64',
      '--config',
      'apps/desktop/electron-builder.yml',
      '--publish',
      'never',
    ],
    // Use faster lossless compression for CI. The release builds with its usual compression.
    { ...env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '3' },
  );
  await run('bun', ['run', 'perf:check:electron-package'], env);
}

async function runProbe(probe, scratch, build, env) {
  const companion = probe === 'companion';
  const version = companion
    ? '0.2.7'
    : JSON.parse(await readFile('scripts/windows-release-baseline.json', 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  const filename = `Lacuna-Setup-${version}.exe`;
  await run(
    'gh',
    ['release', 'download', `v${version}`, '--pattern', filename, '--dir', scratch],
    process.env,
  );

  const script = companion ? 'windows-upgrade-companion.mjs' : 'windows-release-upgrade.mjs';
  const child = spawn(process.execPath, [`scripts/${script}`, path.join(scratch, filename)], {
    env: { ...env, LACUNA_CI_UPGRADE_PIPE: '1' },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // A probe can fail its baseline checks and close stdin before the build finishes.
  // Its exit status reports the failure.
  child.stdin.on('error', () => {});
  const signal = (value) => child.stdin.end(value);
  await Promise.all([
    requireSuccessfulExit(child, script),
    build.then(
      () => signal(audited),
      () => signal(''),
    ),
  ]);
}

async function main(probe) {
  assert.equal(process.platform, 'win32', 'Run on an isolated Windows runner');
  assert.ok(probe === 'companion' || probe === 'release', 'Select one installed upgrade probe');
  const temp = await realpath(tmpdir());
  const scratch = await mkdtemp(path.join(temp, 'lacuna-ci-upgrade-'));
  const env = { ...process.env };
  delete env.GH_TOKEN;
  try {
    const build = buildInstaller(env);
    const results = await Promise.allSettled([build, runProbe(probe, scratch, build, env)]);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason));
  } finally {
    const resolved = await realpath(scratch);
    assert.equal(path.dirname(resolved), temp);
    await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv[2]);
}
