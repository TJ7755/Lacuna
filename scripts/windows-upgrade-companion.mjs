import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { extractFile } = require('@electron/asar');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const baselineVersion = '0.2.7';
const baselineSha256 = 'c14f683fb3047e57c41abad1e40677d20c7bc0d5be376bebfb875e0184b8760a';
const baselineInstaller = path.resolve(process.argv[2] ?? '');
const currentInstaller = path.join(root, 'release', `Lacuna-Setup-${packageJson.version}.exe`);
const reportDirectory = path.join(root, 'test-results', 'windows-upgrade');
const report = { baselineVersion, targetVersion: packageJson.version, stages: [] };

if (process.platform !== 'win32') throw new Error('The installed upgrade probe requires Windows.');
if (!process.argv[2]) throw new Error('Pass the downloaded v0.2.7 installer path.');

async function run(command, args, options = {}) {
  const child = spawn(command, args, { windowsHide: true, ...options });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} exceeded the three-minute limit.`));
    }, 180_000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); resolve(code); });
  });
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function powershell(script, environment = {}) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...environment },
  });
}

async function processSnapshot(stage) {
  const result = await powershell(`
    Get-CimInstance Win32_Process -Filter "name = 'Lacuna.exe'" |
      Select-Object ProcessId, ParentProcessId, ExecutablePath, CreationDate, CommandLine |
      ConvertTo-Json -Compress
  `);
  if (result.exitCode !== 0) throw new Error(`Process snapshot failed: ${result.stderr}`);
  report.stages.push({ stage, processes: result.stdout ? JSON.parse(result.stdout) : [] });
}

async function installedVersion(executable) {
  const archive = path.join(path.dirname(executable), 'resources', 'app.asar');
  return JSON.parse(extractFile(archive, 'package.json').toString()).version;
}

async function install(installer, directory, stage) {
  const result = await run(installer, ['/S', `/D=${directory}`]);
  report.stages.push({ stage, installerExitCode: result.exitCode, stderr: result.stderr });
  assert.equal(result.exitCode, 0, `${stage} installer exited with ${result.exitCode}`);
}

const workspace = await mkdtemp(path.join(tmpdir(), 'lacuna-installed-upgrade-'));
const installDirectory = path.join(workspace, 'Lacuna');
const profile = path.join(workspace, 'profile');
const executable = path.join(installDirectory, 'Lacuna.exe');
let companion;

try {
  const digest = createHash('sha256').update(await readFile(baselineInstaller)).digest('hex');
  assert.equal(digest, baselineSha256, 'The historical installer does not match its published SHA-256.');
  await processSnapshot('before baseline installation');
  await install(baselineInstaller, installDirectory, 'baseline installation');
  assert.equal(await installedVersion(executable), baselineVersion);

  const entry = path.join(installDirectory, 'resources', 'app.asar', 'electron', 'dist-electron', 'mcp', 'aiCompanionEntry.js');
  companion = spawn(executable, [
    entry,
    `--lacuna-host-user-data-dir=${profile}`,
    `--lacuna-app-version=${baselineVersion}`,
  ], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let companionStderr = '';
  companion.stderr.on('data', (chunk) => { companionStderr += chunk.toString(); });
  companion.on('error', (error) => { companionStderr += String(error); });
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  assert.equal(companion.exitCode === null && companion.signalCode === null, true,
    `The baseline companion exited early: ${companionStderr}`);
  report.companionPid = companion.pid;
  await processSnapshot('before upgrade with live companion');
  await install(currentInstaller, installDirectory, 'upgrade');
  await processSnapshot('after upgrade');
  assert.equal(await installedVersion(executable), packageJson.version);
  for (let attempt = 0; attempt < 10 && companion.exitCode === null && companion.signalCode === null; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(companion.exitCode !== null || companion.signalCode !== null, true,
    'The installer left the old companion running.');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = String(error);
  await processSnapshot('failure').catch((snapshotError) => {
    report.snapshotError = String(snapshotError);
  });
  throw error;
} finally {
  companion?.kill();
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(path.join(reportDirectory, 'installed-upgrade.json'), `${JSON.stringify(report, null, 2)}\n`);
  await rm(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 1_000 }).catch(() => undefined);
}
