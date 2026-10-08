import { describe, expect, it } from 'vitest';
import type { QuestionSetAttemptRecord } from './questionSetAttempts';
import { questionSetProgress } from './questionSetProgress';

function attempt(
  id: string,
  updatedAt: number,
  status: QuestionSetAttemptRecord['status'],
  marks = 0,
): QuestionSetAttemptRecord {
  return {
    id,
    courseId: 'course-1',
    questionSetId: 'set-1',
    status,
    createdAt: updatedAt,
    updatedAt,
    decisions: status === 'complete' ? [{ allocationId: 'a1', status: 'awarded', marks }] : [],
    receipt: {
      id: 'set-1',
      courseId: 'course-1',
      title: 'Cells',
      lessonIds: [],
      assessmentIds: [],
      contentVersion: 1,
      contentRevisionId: 'content-1',
      createdAt: 1,
      updatedAt: 1,
      questions: [
        {
          id: 'q1',
          prompt: 'Name it.',
          parts: [],
          answer: {
            maxMarks: 4,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'a1',
                criterion: 'Names it.',
                maxMarks: 4,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
      ],
    },
  } as unknown as QuestionSetAttemptRecord;
}

describe('questionSetProgress', () => {
  it('has nothing to show before the first attempt', () => {
    expect(questionSetProgress([])).toEqual({ history: [], latest: undefined, lastTriedAt: undefined, open: undefined });
  });

  it('scores completed attempts oldest first and keeps the latest five', () => {
    const attempts = [1, 2, 3, 4, 2, 3].map((marks, i) => attempt(`a${i}`, 100 + i, 'complete', marks));
    const progress = questionSetProgress(attempts);
    expect(progress.history).toEqual([50, 75, 100, 50, 75]);
    expect(progress.latest).toBe(75);
    expect(progress.lastTriedAt).toBe(105);
  });

  it('offers the newest unfinished attempt to continue, without scoring it', () => {
    const open = attempt('open', 300, 'answering');
    const progress = questionSetProgress([attempt('done', 200, 'complete', 4), open]);
    expect(progress.history).toEqual([100]);
    expect(progress.open).toBe(open);
    expect(progress.lastTriedAt).toBe(300);
  });
});
