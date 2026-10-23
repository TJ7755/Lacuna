import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { classifyPaths, parseNameStatus, isDocsOnly } from './ci-change-scope.mjs';

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
      execFileSync('node', ['scripts/ci-change-scope.mjs'], { input, encoding: 'utf8' }).trim().split('\n')[0];
    expect(run('docs/a.md\nREADME.md\n')).toBe('docs_only=true');
    expect(run('docs/a.md\nsrc/a.ts\n')).toBe('docs_only=false');
    expect(run('')).toBe('docs_only=false');
  });
});


describe('area scope', () => {
  it('keeps app, root configuration, workflows, shared contracts and unknown paths full', () => {
    for (const path of ['src/App.tsx', 'src/fsrs/coefficients/model.json', 'src/fsrs/halfLifeLogisticModel.ts',
      'eslint.config.js', 'scripts/relay-imports.mjs', 'scripts/relayImports.test.ts', 'package.json', 'bun.lock',
      '.github/workflows/ci.yml', 'tooling/handwriting-maths/package.json', 'tooling/handwriting-maths/bun.lock',
      'relay/package.json', 'tooling/short-term-memory/uv.lock', 'relay/shared/insights/index.ts', 'relay/scripts/security-bun.mjs',
      'tooling/short-term-memory/coefficients/half-life-logistic-v3.json',
      'tooling/short-term-memory/tests/fixtures/model-port-v3.json', 'new-area/file.ts']) {
      expect(Object.values(classifyPaths([path])).slice(1).every(Boolean), path).toBe(true);
    }
    expect(classifyPaths([]).app).toBe(true);
    expect(classifyPaths(['docs/a.md', '../relay/src/a.ts']).electron).toBe(true);
  });

  it('selects relay consumers without unrelated native or training work', () => {
    expect(classifyPaths(['relay/src/relay.ts'])).toMatchObject({
      app: true, relay: true, ai_mcp: true, sites: true, electron: false, python: false, handwriting: false,
    });
  });

  it('selects tooling, sites and mixed changes independently', () => {
    expect(classifyPaths(['tooling/handwriting-maths/src/main.ts'])).toMatchObject({ handwriting: true, lint: true, app: false, electron: false });
    expect(classifyPaths(['tooling/short-term-memory/stm_harness/contract.py'])).toMatchObject({ python: true, app: false });
    expect(classifyPaths(['tooling/lacuna-ai-mcp/src/client.ts'])).toMatchObject({ ai_mcp: true, app: true, electron: true });
    for (const site of ['gaps', 'library', 'courses', 'compare']) {
      expect(classifyPaths([`${site}/index.html`])).toMatchObject({ sites: true, lint: true, app: false, relay: false, electron: false });
    }
    expect(classifyPaths(['docs/a.md', 'library/index.html', 'tooling/handwriting-maths/src/main.ts'])).toMatchObject({ docs: true, docs_only: false, sites: true, handwriting: true, app: false });
    expect(classifyPaths(['docs/a.md'])).toMatchObject({ docs_only: true, app: false, sites: false });
  });

  it('includes deleted files and both rename/copy endpoints, preserving spaces', () => {
    const paths = parseNameStatus('D\0relay/shared/insights/index.ts\0R100\0src/old.ts\0docs/new.md\0C75\0library/a b.html\0gaps/new.html\0');
    expect(paths).toEqual(['relay/shared/insights/index.ts', 'src/old.ts', 'docs/new.md', 'library/a b.html', 'gaps/new.html']);
    expect(classifyPaths(paths).electron).toBe(true);
    expect(classifyPaths(parseNameStatus('R100\0docs/a.md\0relay/src/a.ts\0')).relay).toBe(true);
    expect(classifyPaths(parseNameStatus('D\0tooling/handwriting-maths/src/main.ts\0')).handwriting).toBe(true);
    for (const input of ['', 'M\0file', 'R100\0old\0', 'unexpected\0file\0']) {
      expect(() => parseNameStatus(input)).toThrow();
    }
  });
});
