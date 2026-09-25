import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/opencode.yml'),
  'utf8',
);

const condition = workflow.match(/ {4}if: \|\n((?: {6}.+\n)+)/)?.[1].trim() ?? '';
const permits = new Function('github', 'contains', 'startsWith', `return ${condition};`) as (
  github: { event: { comment: { body: string; user: { login: string } } } },
  contains: (body: string, phrase: string) => boolean,
  startsWith: (body: string, phrase: string) => boolean,
) => boolean;

describe('OpenCode workflow policy', () => {
  it('guards both supported comment events with the same maintainer-only condition', () => {
    expect(workflow).toMatch(/ {2}issue_comment:\n {4}types: \[created\]/);
    expect(workflow).toMatch(/ {2}pull_request_review_comment:\n {4}types: \[created\]/);
    expect(condition).toContain("github.event.comment.user.login == 'TJ7755'");

    for (const eventName of ['issue_comment', 'pull_request_review_comment']) {
      for (const body of ['/oc help', 'please /opencode help']) {
        const comment = { body, user: { login: 'TJ7755' } };
        expect(
          permits(
            { event: { comment } },
            (value, phrase) => value.includes(phrase),
            (value, phrase) => value.startsWith(phrase),
          ),
          eventName,
        ).toBe(true);
        expect(
          permits(
            { event: { comment: { body, user: { login: 'outsider' } } } },
            (value, phrase) => value.includes(phrase),
            (value, phrase) => value.startsWith(phrase),
          ),
          eventName,
        ).toBe(false);
      }
      expect(
        permits(
          { event: { comment: { body: 'ordinary comment', user: { login: 'TJ7755' } } } },
          (value, phrase) => value.includes(phrase),
          (value, phrase) => value.startsWith(phrase),
        ),
        eventName,
      ).toBe(false);
    }
  });

  it('keeps the secret on the pinned action step and never checks out a PR merge ref', () => {
    const actionStep = workflow.indexOf('      - name: Run opencode');
    expect(actionStep).toBeGreaterThan(0);
    expect(workflow.slice(0, actionStep)).not.toContain('OPENCODE_API_KEY');
    expect(workflow).toMatch(/ {8}uses: anomalyco\/opencode\/github@[a-f0-9]{40}\b/);
    expect(workflow).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toMatch(/ {4}permissions:\n {6}id-token: write\n {6}contents: read\n/);
    expect(workflow).not.toMatch(/ {6}(issues|pull-requests): (read|write)/);
    expect(workflow).toMatch(
      / {6}- name: Run opencode\n {8}uses: [^\n]+\n {8}env:\n {10}OPENCODE_API_KEY: \$\{\{ secrets.OPENCODE_API_KEY \}\}\n {10}OPENCODE_PERMISSION: '[^']*"bash":"deny"[^']*'/,
    );
    expect(workflow).not.toMatch(/\$\{\{ github\.event\.comment\.body \}\}/);
  });
});
