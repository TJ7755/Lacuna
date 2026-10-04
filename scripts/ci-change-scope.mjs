// Classifies a pull request's changed paths so CI can skip heavy jobs for documentation-only changes.
// No path under src/, tests/, scripts/, tooling/, electron/, server/, api/ or public/ is ever docs-only,
// because code, prompts and landing pages consume Markdown there.
import { pathToFileURL } from 'node:url';

const DOCS_PREFIXES = ['docs/', '.github/ISSUE_TEMPLATE/'];
const DOCS_FILES = new Set(['.github/PULL_REQUEST_TEMPLATE.md']);

export function isDocsPath(path) {
  if (DOCS_FILES.has(path)) return true;
  if (DOCS_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return /^[^/]+\.md$/.test(path);
}

/** True only when the list is non-empty and every path is documentation. */
export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every(isDocsPath);
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const paths = input.split('\n').map((line) => line.trim()).filter(Boolean);
  console.log(`docs_only=${isDocsOnly(paths)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
