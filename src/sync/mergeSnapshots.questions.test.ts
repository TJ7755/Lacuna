import { describe, expect, it } from 'vitest';
import { mergeSnapshots } from './mergeSnapshots';

import { question, links, attempt, backup, asset } from './mergeSnapshots.questions.testFixtures';

describe('Question schedule and evidence peer merge', () => {
  it('selects the coherent authored bundle without letting a newer schedule revert content', () => {
    const oldQuestion = question('old', 10, {
      prompt: 'Old prompt',
      scheduleUpdatedAt: 1_000,
      updatedAt: 1_000,
    });
    const newQuestion = question('new', 20, { prompt: 'New prompt' });

    const merged = mergeSnapshots(
      backup({ questions: [oldQuestion], questionConcepts: [links('old', 10)] }),
      backup({ questions: [newQuestion], questionConcepts: [links('new', 20)] }),
    );

    expect(merged.questions).toEqual([
      expect.objectContaining({ prompt: 'New prompt', authoringRevisionId: 'new' }),
    ]);
    expect(merged.questionConcepts).toEqual([
      expect.objectContaining({ authoringRevisionId: 'new' }),
    ]);
  });

  it('unions attempt lifecycle state and replays the winning epoch schedule', () => {
    const shown = attempt();
    const answered = attempt({
      status: 'answered',
      answeredAt: 30,
      updatedAt: 30,
      submittedAnswer: '2',
      marksEarned: 1,
      marksAvailable: 1,
      grade: 3,
      scheduleEffect: { kind: 'replay', grade: 3 },
    });

    const merged = mergeSnapshots(
      backup({ questionAttempts: [shown] }),
      backup({ questionAttempts: [answered] }),
    );

    expect(merged.questionAttempts).toEqual([
      expect.objectContaining({ id: 'attempt-1', status: 'answered', submittedAnswer: '2' }),
    ]);
    expect(merged.questions[0]).toMatchObject({ reps: 1, lastReviewed: 30 });

    const undone = mergeSnapshots(
      merged,
      backup({ questionAttempts: [{ ...answered, undoneAt: 50, updatedAt: 50 }] }),
    );
    expect(undone.questionAttempts[0].undoneAt).toBe(50);
    expect(undone.questions[0]).toMatchObject({ reps: 0, lastReviewed: null });
  });

  it('fails closed when one attempt identity carries a different immutable receipt', () => {
    expect(() =>
      mergeSnapshots(
        backup({ questionAttempts: [attempt()] }),
        backup({ questionAttempts: [attempt({ renderedPrompt: 'A different presentation' })] }),
      ),
    ).toThrow(/immutable Question attempt receipt/i);
  });

  it('retains attempt evidence and its assets after a Question is deleted', () => {
    const hash = 'a'.repeat(64);
    const retained = attempt({ renderedExplanation: `![worked](${`lacuna-asset://${hash}`})` });
    const merged = mergeSnapshots(
      backup({ questionAttempts: [retained], assets: [asset(hash)] }),
      backup({
        questions: [],
        questionConcepts: [],
        questionAttempts: [retained],
        assets: [asset(hash)],
        tombstones: [{ table: 'questions', recordId: 'question-1', deletedAt: 50 }],
      }),
    );

    expect(merged.questions).toEqual([]);
    expect(merged.questionConcepts).toEqual([]);
    expect(merged.questionAttempts).toEqual([retained]);
    expect(merged.assets.map((row) => row.hash)).toEqual([hash]);
  });

  it('drops Question definitions and attempts when their Course is deleted', () => {
    const merged = mergeSnapshots(
      backup({ questionAttempts: [attempt()] }),
      backup({
        courses: [],
        tombstones: [{ table: 'courses', recordId: 'course-1', deletedAt: 50 }],
      }),
    );

    expect(merged.courses).toEqual([]);
    expect(merged.questions).toEqual([]);
    expect(merged.questionConcepts).toEqual([]);
    expect(merged.questionAttempts).toEqual([]);
  });
});
