// Unknown paths select the full matrix. Keep cross-runtime contracts ahead of area rules.
import { pathToFileURL } from 'node:url';

const DOCS_PREFIXES = ['docs/', '.github/ISSUE_TEMPLATE/'];
const DOCS_FILES = new Set(['.github/PULL_REQUEST_TEMPLATE.md']);
const questionBankExamples = 'docs/question-bank/examples/';
export const isQuestionBankFixture = (path) =>
  typeof path === 'string' && path.startsWith(questionBankExamples) && path.endsWith('.json');
const fixtureBrowserSpecs = new Map([
  [
    `${questionBankExamples}numeric-family.json`,
    ['concept-practice.spec.ts', 'question-technique-authoring.spec.ts'],
  ],
  [`${questionBankExamples}static-multipart.json`, ['concept-practice.spec.ts']],
]);

const standaloneSuites = [
  {
    site: 'gaps',
    port: 4317,
    prefixes: ['apps/gaps/', 'apps/web/src/teacher/', 'apps/web/src/insights/'],
    files: ['tests/e2e/fixtures/gaps.ts'],
    specs: [
      'gaps-standalone.spec.ts',
      'gaps-worker-migration.spec.ts',
      'gaps-teacher-keys.spec.ts',
      'gaps-course-connection.spec.ts',
      'gaps-artefact-labels.spec.ts',
      'gaps-demo.spec.ts',
    ],
  },
  {
    site: 'library',
    port: 4347,
    prefixes: ['apps/library/', 'apps/web/src/library/'],
    files: ['apps/web/src/components/import/QualificationGuidance.tsx'],
    specs: [
      'library-standalone.spec.ts',
      'library-topic-preview.spec.ts',
      'qualification-guidance.spec.ts',
    ],
  },
  {
    site: 'reporting',
    port: 4327,
    prefixes: ['apps/web/src/insights/'],
    specs: ['gaps-daily-flow.spec.ts'],
  },
];

function selectStandaloneSuites(paths, full) {
  return standaloneSuites
    .filter(
      ({ prefixes, files = [], specs }) =>
        full ||
        paths.some(
          (path) =>
            typeof path === 'string' &&
            (files.includes(path) ||
              prefixes.some((prefix) => path.startsWith(prefix)) ||
              specs.some((spec) => path === `tests/e2e/${spec}`)),
        ),
    )
    .map(({ site, port, specs }) => ({ site, port, specs: specs.join(' ') }));
}

const BROWSER_CI_FILES = new Set([
  '.github/actions/setup-bun/action.yml',
  '.github/actions/setup-node/action.yml',
  '.github/workflows/ci.yml',
  'scripts/browser-ci-summary.mjs',
  'scripts/check-browser.mjs',
  'scripts/ci-browser-artefact.mjs',
  'scripts/ci-browser-shards.mjs',
  'scripts/ci-browser-timings.json',
  'scripts/ci-change-scope.mjs',
  'scripts/ci-node-runtime.mjs',
  'scripts/ci-wait-for-renderer.mjs',
  'tests/config/playwright.web.ci.config.ts',
  'tests/config/playwright.web.config.ts',
  'tests/config/playwright.web.isolated.config.ts',
  'tests/e2e/fixtures/largeStudyImages.ts',
  'tests/e2e/study-grade-load.spec.ts',
  'tests/e2e/study-image-advance.spec.ts',
]);
const AREAS = [
  'app',
  'electron',
  'windows_native',
  'relay',
  'tooling',
  'sites',
  'docs',
  'handwriting',
  'python',
  'ai_mcp',
  'lint',
  'web_tests',
];

export function isDocsPath(path) {
  if (isQuestionBankFixture(path)) return false;
  if (DOCS_FILES.has(path)) return true;
  if (DOCS_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return /^[^/]+\.md$/.test(path);
}

export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every(isDocsPath);
}

function fullScope(browser_ci, standalone_suites) {
  return {
    docs_only: false,
    ...Object.fromEntries(AREAS.map((area) => [area, true])),
    browser_ci,
    standalone_suites,
  };
}

export function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return fullScope(false, selectStandaloneSuites([], true));
  }
  // A pull request changing browser CI must exercise the jobs normally reserved for master.
  const browser_ci = paths.some((path) => BROWSER_CI_FILES.has(path));
  // Select from all paths before an unrelated path can select the general matrix.
  const standalone_suites = selectStandaloneSuites(paths, browser_ci);
  const scope = {
    docs_only: false,
    ...Object.fromEntries(AREAS.map((area) => [area, false])),
    browser_ci,
    standalone_suites,
  };
  for (const path of paths) {
    if (
      typeof path !== 'string' ||
      !path ||
      /[\0\r\n\\]/.test(path) ||
      path.split('/').some((part) => !part || part === '.' || part === '..')
    )
      return fullScope(browser_ci, selectStandaloneSuites([], true));
    if (isDocsPath(path)) {
      scope.docs = true;
      continue;
    }
    if (isQuestionBankFixture(path)) {
      Object.assign(scope, { app: true, docs: true, lint: true });
      continue;
    }
    // Shared runtime, bootstrap, protocols and consumed training fixtures must stay full.
    if (
      /(^|\/)(package\.json|bun\.lock|uv\.lock|vercel\.json|vite\.config\.ts)$/.test(path) ||
      path.startsWith('apps/relay/shared/') ||
      path.startsWith('apps/relay/scripts/') ||
      path.startsWith('tooling/short-term-memory/coefficients/') ||
      path.startsWith('tooling/short-term-memory/tests/fixtures/')
    )
      return fullScope(browser_ci, standalone_suites);
    if (/^apps\/web\/src\/.+\.css$/.test(path)) {
      // Stylesheets alone cannot alter native authority. Retain the existing broad
      // non-Windows checks, without clearing native risk from another changed path.
      Object.assign(scope, {
        ...fullScope(browser_ci, standalone_suites),
        windows_native: scope.windows_native,
      });
    } else if (path.startsWith('apps/relay/')) {
      // App unit/browser fixtures and the standalone MCP tests import apps/relay/src directly.
      Object.assign(scope, { relay: true, app: true, sites: true, ai_mcp: true });
    } else if (path.startsWith('tooling/handwriting-maths/')) {
      Object.assign(scope, { tooling: true, handwriting: true, lint: true });
    } else if (
      path.startsWith('tooling/short-term-memory/') ||
      path.startsWith('tooling/semantic-answer-match/')
    ) {
      Object.assign(scope, { tooling: true, python: true, lint: true });
    } else if (path.startsWith('tooling/lacuna-ai-mcp/')) {
      // Browser and native integration fixtures use the terminal client.
      Object.assign(scope, {
        tooling: true,
        ai_mcp: true,
        app: true,
        electron: true,
        windows_native: true,
        sites: true,
        lint: true,
      });
    } else if (/^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) {
      // Fixtures can be shared with Electron; only web spec entry points are isolated.
      Object.assign(scope, { web_tests: true, sites: true, lint: true });
    } else if (
      path.startsWith('apps/gaps/') ||
      path.startsWith('apps/library/') ||
      path === 'apps/web/src/pages/quizlet/index.html'
    ) {
      Object.assign(scope, { sites: true, lint: true });
    } else {
      return fullScope(browser_ci, standalone_suites);
    }
  }
  scope.docs_only = isDocsOnly(paths);
  return scope;
}

function parseChanges(input) {
  if (!input.endsWith('\0')) throw new Error('Incomplete Git change records');
  const fields = input.slice(0, -1).split('\0');
  const changes = [];
  while (fields.length) {
    const status = fields.shift();
    const count = /^(R|C)\d+$/.test(status) ? 2 : /^[AMDTUXB]$/.test(status) ? 1 : 0;
    if (!count || fields.length < count) throw new Error('Invalid Git change record');
    changes.push({ status, paths: fields.splice(0, count) });
  }
  return changes;
}

// Scope includes deletions and both endpoints of renames and copies.
export function parseNameStatus(input) {
  return parseChanges(input).flatMap(({ paths }) => paths);
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const changes = process.argv.includes('--name-status') ? parseChanges(input) : null;
  const paths = changes?.flatMap((change) => change.paths) ?? input.split('\n').filter(Boolean);
  const scope = classifyPaths(paths);
  for (const [key, value] of Object.entries(scope)) console.log(`${key}=${JSON.stringify(value)}`);
  if (changes) {
    // Playwright can run only the surviving spec path. Admit plain file names only.
    const changedSpecs = changes.flatMap(({ status, paths }) => {
      const path = paths.at(-1);
      const spec = /^tests\/e2e\/([A-Za-z0-9._-]+\.spec\.ts)$/.exec(path);
      return status !== 'D' && spec?.[0] === path ? [spec[1]] : [];
    });
    const specs = new Set([
      ...changedSpecs,
      ...paths.flatMap((path) => fixtureBrowserSpecs.get(path) ?? []),
    ]);
    console.log(`web_specs=${[...specs].join(' ')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
