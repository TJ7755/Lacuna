import { classifyPaths, parseNameStatus } from './ci-change-scope.mjs';
import { evidence, git, installations } from './local-checks.mjs';

const usage =
  'Usage: bun run verify -- [--base <commit>] [--full] [--plan]\nDefault: changes since HEAD plus staged/unstaged changes. --base includes committed changes since its merge base.\nStage new files first. --plan records selection without executing checks; it is not a validation pass.\nExit 2 means local checks passed but required platform evidence remains outstanding.';

async function verify({ run, report }) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  let base = 'HEAD';
  let full = false;
  let plan = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--full') full = true;
    else if (arg === '--plan') plan = true;
    else if (arg === '--base' && args.length && !args[0].startsWith('-')) base = args.shift();
    else throw new Error(usage);
  }
  const baseCommit = git('rev-parse', '--verify', `${base}^{commit}`).trim();
  const mergeBase = git('merge-base', baseCommit, 'HEAD').trim();
  const paths = [];
  for (const records of [
    git('diff', '--name-status', '-z', mergeBase, 'HEAD'),
    git('diff', '--name-status', '-z', 'HEAD'),
  ]) {
    if (records) paths.push(...parseNameStatus(records));
  }
  let scope = classifyPaths(full ? [] : paths);
  // CONTRIBUTING requires the complete matrix for relay, AI and Electron changes.
  if (scope.app || scope.relay || scope.ai_mcp || scope.electron) scope = classifyPaths([]);
  Object.assign(report, {
    mode: plan ? 'plan' : 'verification',
    baseCommit,
    mergeBase,
    paths,
    scope,
  });
  const commands = [];
  const add = (command, args, cwd = '.') => commands.push({ command, args, cwd });
  const bun = (script, cwd = '.', extra = []) => add('bun', ['run', script, ...extra], cwd);
  const test = (script, cwd = '.') => bun(script, cwd, ['--', '--maxWorkers=1']);
  if (!scope.docs_only) {
    for (const cwd of installations) add('bun', ['install', '--frozen-lockfile'], cwd);
    // Node CLI tests are outside Vitest's include patterns.
    add('node', ['--test', '--test-concurrency=1', 'scripts/local-checks.test.mjs']);
  }
  if (scope.docs) bun('docs:check');
  if (scope.app) {
    bun('typecheck');
    test('test:ci:unit');
    test('test:coverage');
    test('test:coverage:recovery');
    test('test:coverage:risk');
  }
  if (scope.lint || scope.app) bun('lint');
  if (scope.relay) {
    bun('typecheck', 'relay');
    bun('lint', 'relay');
    test('test', 'relay');
  }
  if (scope.handwriting) {
    bun('build', 'tooling/handwriting-maths');
    test('test', 'tooling/handwriting-maths');
  }
  if (scope.ai_mcp) {
    for (const script of ['typecheck', 'lint', 'test', 'build']) {
      if (script === 'test') test(script, 'tooling/lacuna-ai-mcp');
      else bun(script, 'tooling/lacuna-ai-mcp');
    }
  }
  if (scope.python) {
    for (const tool of ['short-term-memory', 'semantic-answer-match']) {
      add('uv', ['run', '--locked', 'pytest'], `tooling/${tool}`);
    }
  }
  if (scope.app || scope.sites || scope.web_tests) {
    bun('build:assets');
    bun('release:scenario');
    bun('perf:check');
    // Download browsers locally; never install OS packages or elevate privileges.
    report.browserPrerequisites =
      'OS browser dependencies must already be installed; browser launches validate them. No --with-deps or global package changes are performed.';
    add('bun', ['x', 'playwright', 'install', 'chromium', 'webkit']);
    bun('test:e2e:web', '.', ['--', '--workers=1']);
  }
  if (scope.electron) {
    if (process.platform === 'win32') {
      bun('test:e2e:electron-ai', '.', ['--', '--workers=1']);
      bun('electron:build:win');
    } else
      report.outstanding.push('Windows: bun run test:e2e:electron-ai; bun run electron:build:win');
    // The classifier deliberately treats unknown/release paths as the full scope.
    for (const [platform, script] of [
      ['linux', 'electron:build:linux'],
      ['darwin', 'electron:build:mac'],
    ]) {
      if (process.platform === platform) bun(script);
      else report.outstanding.push(`${platform}: bun run ${script}`);
    }
    report.nativeEvidenceNote =
      'Package builds do not certify signing or notarisation. Only the host platform target is executed locally.';
  }
  report.plan = commands;
  console.log(JSON.stringify({ scope, commands }, null, 2));
  if (plan) {
    // A plan has no successful checks, including on the current platform.
    report.outstanding.push('Plan only: selected checks were not executed');
    return;
  }
  for (const { command, args, cwd } of commands) await run(command, args, cwd);
}

if (process.argv.slice(2).join(' ') === '--help') console.log(usage);
else process.exitCode = await evidence('verify', verify);
