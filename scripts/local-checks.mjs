import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRevision } from '../apps/relay/scripts/security-bun.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export const installations = ['.', 'apps/relay', 'tooling/handwriting-maths'];
export const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function source() {
  if (git('ls-files', '--others', '--exclude-standard', '-z')) {
    throw new Error('Stage new files before verification so the source fingerprint includes them');
  }
  const patch = git(
    'diff',
    'HEAD',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    '--',
    '.',
    ':(exclude)**/MEMORIES.md',
    ':(exclude)MEMORIES.md',
  );
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    status: git('status', '--porcelain'),
    diffSha256: createHash('sha256').update(patch).digest('hex'),
  };
}

export async function evidence(name, work) {
  const parent = join(root, 'artifacts', 'local-checks');
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, `${name}-`));
  const report = {
    name,
    platform: process.platform,
    arch: process.arch,
    startedAt: new Date().toISOString(),
    commands: [],
    outstanding: [],
  };
  const save = () =>
    writeFileSync(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Evidence: ${directory}`);
  const started = performance.now();
  let status = 1;
  let activeChild;
  let interruptedSignal;
  let killTimer;
  const stopCommand = (signal) => {
    if (!activeChild?.pid) return;
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(activeChild.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } else process.kill(-activeChild.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH' && process.platform !== 'win32') throw error;
    }
  };
  const interrupt = (signal) => {
    interruptedSignal ??= signal;
    report.interruptedSignal = interruptedSignal;
    stopCommand(signal);
    killTimer ??= setTimeout(() => stopCommand('SIGKILL'), 5000).unref();
  };
  const onInterrupt = () => interrupt('SIGINT');
  const onTerminate = () => interrupt('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const run = async (command, args, cwd = '.', capture = false) => {
    if (interruptedSignal) throw new Error(`Interrupted by ${interruptedSignal}`);
    const env = args[0] === 'run' && args[1] === 'test:e2e:web' ? { CI: 'true' } : {};
    const record = { command, args, cwd, env, startedAt: new Date().toISOString() };
    report.commands.push(record);
    save();
    const commandStarted = performance.now();
    const log = join(directory, `${report.commands.length}.log`);
    writeFileSync(log, '');
    let output = '';
    console.log(`[${cwd}] ${command} ${args.join(' ')}`);
    const code = await new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: join(root, cwd),
        env: { ...process.env, ...env },
        shell: false,
        detached: process.platform !== 'win32',
      });
      activeChild = child;
      child.stdout.on('data', (data) => {
        appendFileSync(log, data);
        if (capture) output += data;
        else process.stdout.write(data);
      });
      child.stderr.on('data', (data) => {
        appendFileSync(log, data);
        process.stderr.write(data);
      });
      child.on('error', (error) => {
        record.error = error.message;
        appendFileSync(log, `${error.message}\n`);
      });
      child.on('close', (code, signal) => {
        record.signal = signal;
        resolve(code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 127));
      });
    });
    if (interruptedSignal) stopCommand('SIGKILL');
    activeChild = undefined;
    clearTimeout(killTimer);
    killTimer = undefined;
    Object.assign(record, {
      exitCode: code,
      durationMs: Math.round(performance.now() - commandStarted),
      log,
    });
    save();
    if (code) {
      const error = new Error(
        `${command} failed with exit status ${code}${record.error ? `: ${record.error}` : ''}`,
      );
      error.exitCode = code;
      throw error;
    }
    return output;
  };
  try {
    report.source = source();
    const version = readFileSync(join(root, '.bun-version'), 'utf8').trim();
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const pin = JSON.parse(
      readFileSync(join(root, 'apps/relay/scripts/security-bun.json'), 'utf8'),
    );
    if (version !== pin.version || manifest.packageManager !== `bun@${version}`) {
      throw new Error('Bun version, security pin and packageManager disagree');
    }
    report.bunRevision = (await run('bun', ['--revision'], '.', true)).trim();
    verifyRevision(report.bunRevision);
    await work({ run, report });
    report.sourceAfter = source();
    if (JSON.stringify(report.sourceAfter) !== JSON.stringify(report.source)) {
      throw new Error('Source changed during verification; rerun against one candidate');
    }
    status = report.outstanding.length ? 2 : 0;
  } catch (error) {
    report.error = error.message;
    console.error(error.message);
    status = error.exitCode === 2 ? 1 : (error.exitCode ?? 1);
  } finally {
    if (interruptedSignal) status = 128 + constants.signals[interruptedSignal];
    clearTimeout(killTimer);
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    report.exitCode = status;
    report.durationMs = Math.round(performance.now() - started);
    report.completedAt = new Date().toISOString();
    save();
    for (const item of report.outstanding) console.error(`Outstanding: ${item}`);
  }
  return status;
}
