import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { isDocsOnly } from './ci-change-scope.mjs';

describe('isDocsOnly', () => {
  it('accepts docs, root Markdown and GitHub templates', () => {
    expect(
      isDocsOnly([
        'docs/maintenance/governance.md',
        'docs/images/diagram.png',
        'README.md',
        'AGENTS.md',
        'AI_GATEWAY_PLAN.md',
        '.github/ISSUE_TEMPLATE/bug.yml',
        '.github/PULL_REQUEST_TEMPLATE.md',
      ]),
    ).toBe(true);
  });

  it('rejects a mixed list', () => {
    expect(isDocsOnly(['docs/SPEC.md', 'src/App.tsx'])).toBe(false);
  });

  it('rejects code, manifests, prompts and workflows', () => {
    expect(isDocsOnly(['src/App.tsx'])).toBe(false);
    expect(isDocsOnly(['package.json'])).toBe(false);
    expect(isDocsOnly(['tooling/lacuna-ai-mcp/prompts/system.md'])).toBe(false);
    expect(isDocsOnly(['src/pages/quizlet/README.md'])).toBe(false);
    expect(isDocsOnly(['public/landing.md'])).toBe(false);
    expect(isDocsOnly(['.github/workflows/ci.yml'])).toBe(false);
  });

  it('rejects an empty list', () => {
    expect(isDocsOnly([])).toBe(false);
  });

  it('prints the workflow output from standard input', () => {
    const run = (input: string) =>
      execFileSync('node', ['scripts/ci-change-scope.mjs'], { input, encoding: 'utf8' }).trim();
    expect(run('docs/a.md\nREADME.md\n')).toBe('docs_only=true');
    expect(run('docs/a.md\nsrc/a.ts\n')).toBe('docs_only=false');
    expect(run('')).toBe('docs_only=false');
  });
});
