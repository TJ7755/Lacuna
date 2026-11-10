import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    { ...env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '1' },
  );
  await run('bun', ['run', 'perf:check:electron-package'], env);
}

async function baselineRelease(probe) {
  const version =
    probe === 'companion'
      ? '0.2.7'
      : JSON.parse(await readFile('scripts/windows-release-baseline.json', 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  return { version, filename: `Lacuna-Setup-${version}.exe` };
}

async function downloadBaseline({ version, filename }, directory) {
  await run(
    'gh',
    ['release', 'download', `v${version}`, '--pattern', filename, '--dir', directory],
    process.env,
  );
}

async function waitForBaseline(directory) {
  const deadline = performance.now() + 120_000;
  while (performance.now() < deadline) {
    const files = await readdir(directory).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    });
    assert.ok(!files.includes('download-failed'), 'The pinned baseline download failed');
    if (files.includes('downloaded')) return;
    await setTimeout(250);
  }
  throw new Error('Timed out waiting for the pinned baseline download');
}

async function runProbe(probe, installer, build, env) {
  const script =
    probe === 'companion'
      ? new URL('./windows-upgrade-companion.mjs', import.meta.url)
      : new URL('./windows-release-upgrade.mjs', import.meta.url);
  const child = spawn(process.execPath, [fileURLToPath(script), installer], {
    env: { ...env, LACUNA_CI_UPGRADE_PIPE: '1' },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  // A probe can fail its baseline checks and close stdin before the build finishes.
  // Its exit status reports the failure.
  child.stdin.on('error', () => {});
  const signal = (value) => child.stdin.end(value);
  await Promise.all([
    requireSuccessfulExit(child, path.basename(script.pathname)),
    build.then(
      () => signal(audited),
      () => signal(''),
    ),
  ]);
}

async function main(probe, mode) {
  assert.equal(process.platform, 'win32', 'Run on an isolated Windows runner');
  assert.ok(probe === 'companion' || probe === 'release', 'Select one installed upgrade probe');
  assert.ok(
    mode === undefined || mode === '--prefetch-baseline' || mode === '--use-prefetched-baseline',
    'Expected an optional baseline prefetch mode',
  );
  const baseline = await baselineRelease(probe);
  const runnerTemp = process.env.RUNNER_TEMP;
  if (mode) assert.ok(runnerTemp, 'Expected a GitHub Actions runner temporary directory');
  const temp = await realpath(mode ? runnerTemp : tmpdir());
  const scratch = mode
    ? path.join(temp, `lacuna-ci-upgrade-baseline-${probe}`)
    : await mkdtemp(path.join(temp, 'lacuna-ci-upgrade-'));
  if (mode === '--prefetch-baseline') {
    await mkdir(scratch);
    try {
      await downloadBaseline(baseline, scratch);
      await writeFile(path.join(scratch, 'downloaded'), '');
    } catch (error) {
      await writeFile(path.join(scratch, 'download-failed'), '');
      throw error;
    }
    return;
  }

  const env = { ...process.env };
  delete env.GH_TOKEN;
  try {
    const build = buildInstaller(env);
    // A slow download delays only the probe; packaging can proceed without it.
    const ready = mode ? waitForBaseline(scratch) : downloadBaseline(baseline, scratch);
    const results = await Promise.allSettled([
      build,
      ready.then(() => runProbe(probe, path.join(scratch, baseline.filename), build, env)),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason));
  } finally {
    if (!mode) {
      const resolved = await realpath(scratch);
      assert.equal(path.dirname(resolved), temp);
      await rm(resolved, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main(process.argv[2], process.argv[3]);
}
