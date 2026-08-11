import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] : 'canonical';
if (scenario !== 'canonical') throw new Error(`Unknown release scenario "${scenario ?? ''}".`);

const reportIndex = args.indexOf('--report-dir');
const requestedReportDir = reportIndex >= 0 ? args[reportIndex + 1] : undefined;
if (reportIndex >= 0 && (!requestedReportDir || requestedReportDir.startsWith('-'))) {
  throw new Error('--report-dir requires a specific directory.');
}
const reportDir = requestedReportDir
  ? resolve(root, requestedReportDir)
  : join(root, 'artifacts', 'release-scenarios', new Date().toISOString().replaceAll(':', '-'));
const temporaryProfile = await mkdtemp(join(tmpdir(), 'lacuna-release-scenario-'));
await mkdir(reportDir, { recursive: true });

const testFiles = [
  'src/release/canonicalScenario.test.ts',
  'src/components/import/ShareCodeImportPanel.test.tsx',
  'src/components/import/UnifiedImportPanel.test.tsx',
  'src/pages/settings/DataPortabilitySection.test.tsx',
];
const startedAt = new Date().toISOString();
let output = '';
let exitCode = 1;

try {
  exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...testFiles], {
      cwd: root,
      env: { ...process.env, LACUNA_RELEASE_PROFILE: temporaryProfile },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); output += chunk; });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); output += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
} finally {
  const report = {
    schemaVersion: 1,
    scenario,
    status: exitCode === 0 ? 'pass' : 'fail',
    startedAt,
    finishedAt: new Date().toISOString(),
    isolatedProfile: { kind: 'disposable-fake-indexeddb', destroyed: true },
    evidence: [
      { kind: 'programmatic-scenario', subject: 'MCP construction, share/backup counts, non-mutating preview, exact restore and reload persistence' },
      { kind: 'gui-automation', subject: 'Both share-code import surfaces and full-backup preview rendering' },
      { kind: 'human-inspection', subject: 'Visual, physical and platform-dependent checklist items', status: 'not-run' },
    ],
    testFiles,
    output,
  };
  await writeFile(join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rm(temporaryProfile, { recursive: true, force: true });
  process.stderr.write(`Release report: ${join(reportDir, 'report.json')}\n`);
}

process.exitCode = exitCode;
