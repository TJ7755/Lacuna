import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const digest = (text) => createHash('sha256').update(text).digest('hex');
function sourceState(directory) {
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  if (git('ls-files', '--others', '--exclude-standard').trim()) {
    throw new Error(
      'Stage new files before verification so the recorded source fingerprint includes them',
    );
  }
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    status: git('status', '--porcelain'),
    diffSha256: digest(
      git(
        'diff',
        'HEAD',
        '--full-index',
        '--no-ext-diff',
        '--no-textconv',
        '--',
        '.',
        ':(exclude)**/MEMORIES.md',
        ':(exclude)MEMORIES.md',
      ),
    ),
  };
}

export function previewBrowser({ directory = root, env = process.env, execute = spawnSync } = {}) {
  if (!env.LACUNA_BROWSER_RUN_DIR) {
    throw new Error('Run this preview through bun run verify:browser');
  }
  const result = execute(
    'bun',
    [
      'x',
      'vite',
      'preview',
      ...(env.LACUNA_BROWSER_SITE === 'gaps'
        ? ['--config', 'vite.gaps.config.ts']
        : env.LACUNA_BROWSER_SITE === 'library'
          ? ['--config', 'vite.library.config.ts']
          : []),
      '--host',
      '127.0.0.1',
      '--port',
      env.PLAYWRIGHT_WEB_PORT ?? '4173',
      '--strictPort',
      '--outDir',
      join(env.LACUNA_BROWSER_RUN_DIR, 'dist'),
    ],
    { cwd: directory, env, stdio: 'inherit', shell: false },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Browser preview terminated by ${result.signal}`);
  return result.status ?? 1;
}

export function verifyBrowser({
  directory = root,
  args = [],
  env = process.env,
  execute = spawnSync,
} = {}) {
  if (args.some((arg) => /^(?:-c|--(?:config|output|reporter)(?:=|$))/.test(arg))) {
    throw new Error(
      'verify:browser owns its isolated configuration, output and reporters; pass test/project filters instead',
    );
  }
  if (args.includes('--gaps') && args.includes('--library')) {
    throw new Error('Choose one browser site: --gaps or --library');
  }
  const site = args.includes('--library') ? 'library' : args.includes('--gaps') ? 'gaps' : 'lacuna';
  args = args.filter((arg) => arg !== '--gaps' && arg !== '--library');
  const parent = join(directory, 'artifacts', 'browser-checks');
  mkdirSync(parent, { recursive: true });
  const runDirectory = mkdtempSync(join(parent, 'run-'));
  const buildDirectory = join(runDirectory, 'dist');
  const browserEnv = {
    ...env,
    LACUNA_BROWSER_SITE: site,
    LACUNA_BROWSER_RUN_DIR: runDirectory,
    PLAYWRIGHT_HTML_OPEN: 'never',
  };
  // Playwright gives these inherited destinations precedence over reporter configuration.
  for (const key of [
    'PLAYWRIGHT_HTML_OUTPUT_DIR',
    'PLAYWRIGHT_HTML_REPORT',
    'PLAYWRIGHT_JSON_OUTPUT_FILE',
    'PLAYWRIGHT_JSON_OUTPUT_DIR',
    'PLAYWRIGHT_JSON_OUTPUT_NAME',
    'PLAYWRIGHT_LAST_RUN_OUTPUT_FILE',
    'PW_TEST_REPORTER',
  ])
    delete browserEnv[key];
  const source = sourceState(directory);
  const report = { source, site, args, startedAt: new Date().toISOString(), buildDirectory };
  const reportPath = join(runDirectory, 'source.json');
  const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  save();
  console.log(`Browser evidence: ${reportPath}`);
  const run = (commandArgs) => {
    const result = execute('bun', commandArgs, {
      cwd: directory,
      stdio: 'inherit',
      env: browserEnv,
    });
    if (result.error) throw result.error;
    if (result.signal) throw new Error(`Browser command terminated by ${result.signal}`);
    return result.status ?? 1;
  };
  let status = 1;
  try {
    status = run([
      'run',
      site === 'library'
        ? 'build:library:assets'
        : site === 'gaps'
          ? 'build:gaps:assets'
          : 'build:assets',
      '--outDir',
      buildDirectory,
      '--emptyOutDir',
    ]);
    if (status === 0) {
      report.indexSha256 = digest(readFileSync(join(buildDirectory, 'index.html')));
      if (JSON.stringify(sourceState(directory)) !== JSON.stringify(source)) {
        throw new Error('Source changed during the build; rerun against one candidate');
      }
      status = run([
        'x',
        'playwright',
        'test',
        '-c',
        'tests/config/playwright.web.isolated.config.ts',
        ...args,
      ]);
    }
    report.sourceAfter = sourceState(directory);
    if (JSON.stringify(report.sourceAfter) !== JSON.stringify(source)) {
      throw new Error(
        'Source changed during verification; results are not a frozen-candidate pass',
      );
    }
  } catch (error) {
    report.error = error.message;
    console.error(error.message);
    status = 1;
  } finally {
    report.completedAt = new Date().toISOString();
    report.exitCode = status;
    save();
  }
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    process.exitCode = args[0] === '--preview' ? previewBrowser() : verifyBrowser({ args });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
