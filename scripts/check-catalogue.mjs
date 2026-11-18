// Ordered ownership and consumer checks shared by CI scope and local verification.
// Full CI scope remains deliberately broader than the quick feedback checks.
const owners = [
  {
    id: 'shared',
    matches: (path) =>
      /(^|\/)(package\.json|bun\.lock|vercel\.json|vite\.config\.ts)$/.test(path) ||
      ['apps/relay/shared/', 'apps/relay/scripts/'].some((prefix) => path.startsWith(prefix)),
    full: true,
  },
  {
    id: 'styles',
    matches: (path) => /^apps\/web\/src\/.+\.css$/.test(path),
    typechecks: ['typecheck:web'],
  },
  {
    id: 'relay',
    prefixes: ['apps/relay/'],
    areas: ['relay', 'app', 'sites', 'ai_mcp'],
    // Relay source is consumed in-process by both the app and MCP tool.
    typechecks: ['typecheck:web', 'typecheck:server'],
    workspaces: ['apps/relay', 'tooling/lacuna-ai-mcp'],
    related: true,
  },
  {
    id: 'ai-mcp',
    prefixes: ['tooling/lacuna-ai-mcp/'],
    areas: ['tooling', 'ai_mcp', 'app', 'electron', 'windows_native', 'sites', 'lint'],
    typechecks: ['typecheck:web', 'typecheck:electron'],
    workspaces: ['tooling/lacuna-ai-mcp'],
    related: true,
  },
  {
    id: 'web-spec',
    matches: (path) => /^tests\/e2e\/[^/]+\.spec\.ts$/.test(path),
    areas: ['web_tests', 'sites', 'lint'],
    typechecks: ['typecheck:web'],
  },
  {
    id: 'sites',
    prefixes: ['apps/gaps/', 'apps/library/'],
    matches: (path) => path === 'apps/web/src/pages/quizlet/index.html',
    areas: ['sites', 'lint'],
    typechecks: ['typecheck:web'],
    related: true,
  },
  {
    id: 'web',
    prefixes: ['apps/web/src/'],
    full: true,
    typechecks: ['typecheck:web'],
    related: true,
  },
  {
    id: 'server',
    prefixes: ['api/', 'apps/ai/'],
    full: true,
    typechecks: ['typecheck:server'],
    related: true,
  },
  {
    id: 'desktop',
    prefixes: ['apps/desktop/'],
    full: true,
    typechecks: ['typecheck:electron'],
    related: true,
  },
  {
    id: 'scripts',
    prefixes: ['scripts/'],
    full: true,
    typechecks: ['typecheck:web'],
    related: true,
    nodeTests: true,
  },
];
const unknown = { id: 'unknown', full: true };

export function ownerFor(path) {
  return (
    owners.find(
      ({ prefixes = [], matches }) =>
        prefixes.some((prefix) => path.startsWith(prefix)) || matches?.(path),
    ) ?? unknown
  );
}

export const workspaceChecks = {
  'apps/relay': ['typecheck', 'lint', 'test'],
  'tooling/lacuna-ai-mcp': ['typecheck', 'lint', 'test'],
};
