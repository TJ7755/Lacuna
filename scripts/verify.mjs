import { classifyPaths, parseNameStatus } from './ci-change-scope.mjs';
import { quickChecks } from './quick-checks.mjs';
import { workspaceChecks } from './check-catalogue.mjs';
import { evidence, git, installations } from './local-checks.mjs';

const usage =
  'Usage: bun run verify -- [--base <commit>] [--full | --quick] [--plan]\nDefault: changes since HEAD plus staged/unstaged changes. --base includes committed changes since its merge base.\nStage new files first. --plan records selection without executing checks; it is not a validation pass.\nQuick mode is incomplete feedback, never full validation. Exit 2 means checks passed but validation remains outstanding.';

async function verify({ run, report }) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  let base = 'HEAD';
  let full = false;
  let quick = false;
  let plan = false;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--full') full = true;
    else if (arg === '--quick') quick = true;
    else if (arg === '--plan') plan = true;
    else if (arg === '--base' && args.length && !args[0].startsWith('-')) base = args.shift();
    else throw new Error(usage);
  }
  if (full && quick) throw new Error(usage);
  const baseCommit = git('rev-parse', '--verify', `${base}^{commit}`).trim();
  const mergeBase = git('merge-base', baseCommit, 'HEAD').trim();
  const paths = [];
  for (const records of [
    git('diff', '--name-status', '-z', '--find-renames', mergeBase, 'HEAD'),
    git('diff', '--name-status', '-z', '--find-renames', 'HEAD'),
  ]) {
    if (records) paths.push(...parseNameStatus(records));
  }
  const changedPaths = [...new Set(paths)];
  let scope = classifyPaths(full ? [] : paths);
  // CONTRIBUTING requires the complete matrix for relay, AI and Electron changes.
  if (scope.app || scope.relay || scope.ai_mcp || scope.electron) scope = classifyPaths([]);
  Object.assign(report, {
    mode: quick ? 'quick' : plan ? 'plan' : 'verification',
    planOnly: plan,
    validationComplete: false,
    baseCommit,
    mergeBase,
    paths,
    scope,
  });
  if (quick) {
    const selection = quickChecks(changedPaths);
    report.plan = selection.commands;
    report.broadFallback = selection.broad;
    report.outstanding.push(
      'Quick verification is incomplete: full validation remains outstanding. Run verify without --quick and satisfy CONTRIBUTING.md and required CI gates.',
    );
    report.testSelectionNote =
      'Related tests follow the current import graph; no related tests is allowed. Coverage, browser, native and full lint evidence remain outstanding.';
    console.log(JSON.stringify({ mode: 'quick', scope, ...selection }, null, 2));
    if (plan) report.outstanding.push('Plan only: selected checks were not executed');
    else for (const { command, args, cwd } of selection.commands) await run(command, args, cwd);
    return;
  }
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
  if (scope.lint || scope.app) {
    bun('lint');
    bun('knip');
  }
  for (const [area, cwd] of [
    ['relay', 'apps/relay'],
    ['ai_mcp', 'tooling/lacuna-ai-mcp'],
  ]) {
    if (!scope[area]) continue;
    const scripts = [...workspaceChecks[cwd]];
    if (area === 'ai_mcp') scripts.push('build');
    for (const script of scripts) {
      if (script === 'test') test(script, cwd);
      else bun(script, cwd);
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
    for (const { site, specs } of scope.standalone_suites) {
      // The reporting suite uses a feature-flagged main web build in CI.
      if (site === 'reporting') continue;
      bun('verify:browser', '.', [
        '--',
        `--${site}`,
        '--project=chromium',
        '--workers=1',
        ...specs.split(' '),
      ]);
    }
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
