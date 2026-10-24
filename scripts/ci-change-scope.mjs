// Unknown paths select the full matrix. Keep cross-runtime contracts ahead of area rules.
import { pathToFileURL } from 'node:url';

const DOCS_PREFIXES = ['docs/', '.github/ISSUE_TEMPLATE/'];
const DOCS_FILES = new Set(['.github/PULL_REQUEST_TEMPLATE.md']);
const AREAS = ['app', 'electron', 'relay', 'tooling', 'sites', 'docs', 'handwriting', 'python', 'ai_mcp', 'lint', 'web_tests'];

export function isDocsPath(path) {
  if (DOCS_FILES.has(path)) return true;
  if (DOCS_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return /^[^/]+\.md$/.test(path);
}

export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every(isDocsPath);
}

function fullScope() {
  return { docs_only: false, ...Object.fromEntries(AREAS.map((area) => [area, true])) };
}

export function classifyPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return fullScope();
  const scope = { docs_only: false, ...Object.fromEntries(AREAS.map((area) => [area, false])) };
  for (const path of paths) {
    if (typeof path !== 'string' || !path || /[\0\r\n\\]/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) return fullScope();
    if (isDocsPath(path)) { scope.docs = true; continue; }
    // Shared runtime, bootstrap, protocols and consumed training fixtures must stay full.
    if (/(^|\/)(package\.json|bun\.lock|uv\.lock|vercel\.json)$/.test(path) ||
        path.startsWith('relay/shared/') || path.startsWith('relay/scripts/') ||
        path.startsWith('tooling/short-term-memory/coefficients/') ||
        path.startsWith('tooling/short-term-memory/tests/fixtures/')) return fullScope();
    if (path.startsWith('relay/')) {
      // App unit/browser fixtures and the standalone MCP tests import relay/src directly.
      Object.assign(scope, { relay: true, app: true, sites: true, ai_mcp: true });
    } else if (path.startsWith('tooling/handwriting-maths/')) {
      Object.assign(scope, { tooling: true, handwriting: true, lint: true });
    } else if (path.startsWith('tooling/short-term-memory/') || path.startsWith('tooling/semantic-answer-match/')) {
      Object.assign(scope, { tooling: true, python: true, lint: true });
    } else if (path.startsWith('tooling/lacuna-ai-mcp/')) {
      // Browser and native integration fixtures use the terminal client.
      Object.assign(scope, { tooling: true, ai_mcp: true, app: true, electron: true, sites: true, lint: true });
    } else if (/^tests\/e2e\/[^/]+\.spec\.ts$/.test(path)) {
      // Fixtures can be shared with Electron; only web spec entry points are isolated.
      Object.assign(scope, { web_tests: true, sites: true, lint: true });
    } else if (['gaps/', 'library/', 'courses/', 'compare/'].some((prefix) => path.startsWith(prefix))) {
      Object.assign(scope, { sites: true, lint: true });
    } else {
      return fullScope();
    }
  }
  scope.docs_only = isDocsOnly(paths);
  return scope;
}

// --name-status consumes Git's NUL-delimited records, including both rename endpoints.
export function parseNameStatus(input) {
  if (!input.endsWith('\0')) throw new Error('Incomplete Git change records');
  const fields = input.slice(0, -1).split('\0');
  const paths = [];
  while (fields.length) {
    const status = fields.shift();
    const count = /^(R|C)\d+$/.test(status) ? 2 : /^[AMDTUXB]$/.test(status) ? 1 : 0;
    if (!count || fields.length < count) throw new Error('Invalid Git change record');
    paths.push(...fields.splice(0, count));
  }
  return paths;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const paths = process.argv.includes('--name-status')
    ? parseNameStatus(input)
    : input.split('\n').filter(Boolean);
  const scope = classifyPaths(paths);
  for (const [key, value] of Object.entries(scope)) console.log(`${key}=${value}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
