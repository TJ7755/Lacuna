import { describe, expect, it } from 'vitest';
import { parseBatchOutput, parseEditedCandidate } from './batchStaging';
import { BATCH_OUTPUT_END, BATCH_OUTPUT_START } from './prompts';

function block(items: unknown[]): string {
  return `${BATCH_OUTPUT_START}\n${JSON.stringify({ version: 1, items })}\n${BATCH_OUTPUT_END}`;
}

describe('parseBatchOutput', () => {
  it('validates numeric and fixture-tested working items independently', () => {
    const result = parseBatchOutput(
      block([
        { kind: 'numeric', question: 'What is 2 + 2?', answer: { kind: 'exact', value: '4' } },
        {
          kind: 'working',
          question: 'Solve 2x = 8.',
          scheme: '[1] substitution :: 2x = 8\n[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['2x = 8', '4'], expectedMarks: 2 }],
        },
      ]),
    );

    expect(result.error).toBeNull();
    expect(result.candidates.map((candidate) => candidate.errors)).toEqual([[], []]);
    expect(result.candidates[1].fixtureStatus).toEqual({ total: 1, passed: 1 });
    expect(result.candidates[1].payload).toMatchObject({ kind: 'working' });
  });

  it('keeps malformed neighbours separate and reports failing fixtures', () => {
    const result = parseBatchOutput(
      block([
        { kind: 'working', question: 'Broken', scheme: 'no marks', fixtures: [] },
        {
          kind: 'working',
          question: 'Fixture mismatch',
          scheme: '[1] answer :: equals :: 4',
          fixtures: [{ studentAnswer: ['5'], expectedMarks: 1 }],
        },
        { kind: 'numeric', question: 'Valid', answer: { kind: 'exact', value: '6' } },
      ]),
    );

    expect(result.candidates[0].errors.join(' ')).toContain('Scheme line 1');
    expect(result.candidates[1].errors.join(' ')).toContain('expected 1 marks but received 0');
    expect(result.candidates[2].errors).toEqual([]);
  });

  it('requires the versioned delimiters and valid top-level JSON', () => {
    expect(parseBatchOutput('{}').error).toContain(BATCH_OUTPUT_START);
    expect(parseBatchOutput(`${BATCH_OUTPUT_START}\nnope\n${BATCH_OUTPUT_END}`).error).toContain(
      'invalid',
    );
  });
});

describe('parseEditedCandidate', () => {
  it('revalidates an edited item without reparsing its neighbours', () => {
    const candidate = parseEditedCandidate(
      JSON.stringify({
        kind: 'numeric',
        question: 'Corrected question',
        answer: { kind: 'exact', value: '9' },
      }),
      4,
    );

    expect(candidate.id).toBe('batch-item-5');
    expect(candidate.question).toBe('Corrected question');
    expect(candidate.errors).toEqual([]);
  });
});
