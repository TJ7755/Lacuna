import { describe, expect, it } from 'vitest';
import type { QuestionSetRecord } from './questionSetCodec';
import { mergeQuestionSetRecords } from './questionSetMerge';

function record(overrides: Partial<QuestionSetRecord> = {}): QuestionSetRecord {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question-1',
        prompt: 'Explain it.',
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'allocation-1',
              criterion: 'Explains it',
              maxMarks: 1,
              dimension: 'knowledge',
              targetConceptIds: [],
            },
          ],
        },
        parts: [],
      },
    ],
    contentVersion: 1,
    contentRevisionId: 'revision-a',
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  };
}

describe('Question Set merge', () => {
  it('uses revision identity as the deterministic equal-time tie-break', () => {
    const selected = mergeQuestionSetRecords(
      [record()],
      [record({ title: 'New paper', contentRevisionId: 'revision-b' })],
    );
    expect(selected[0].title).toBe('New paper');
  });

  it('rejects unequal authored content claiming the same revision', () => {
    expect(() => mergeQuestionSetRecords([record()], [record({ title: 'Conflict' })])).toThrow(
      'revision-a has conflicting content',
    );
  });

  it('rejects an identity collision across Courses', () => {
    expect(() =>
      mergeQuestionSetRecords(
        [record()],
        [record({ courseId: 'course-2', contentRevisionId: 'revision-b', updatedAt: 20 })],
      ),
    ).toThrow('cannot move between Courses');
  });

  it('commutes when equal revisions differ only in creation metadata', () => {
    const a = record({ createdAt: 1 });
    const b = record({ createdAt: 2 });
    expect(mergeQuestionSetRecords([a], [b])).toEqual(mergeQuestionSetRecords([b], [a]));
  });

  it('honours the newest tombstone and allows a strictly newer restore', () => {
    expect(
      mergeQuestionSetRecords(
        [record({ updatedAt: 20 })],
        [],
        [
          { table: 'questionSets', recordId: 'set-1', deletedAt: 5 },
          { table: 'questionSets', recordId: 'set-1', deletedAt: 25 },
        ],
      ),
    ).toEqual([]);
    expect(
      mergeQuestionSetRecords(
        [record({ updatedAt: 26 })],
        [],
        [{ table: 'questionSets', recordId: 'set-1', deletedAt: 25 }],
      ),
    ).toHaveLength(1);
  });
});
