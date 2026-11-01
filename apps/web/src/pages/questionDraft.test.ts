import { describe, expect, it } from 'vitest';
import {
  createQuestionDraft,
  EMPTY_QUESTION_AUTHORING_STATE,
  questionDraftKey,
} from './questionDraft';

describe('Question draft state', () => {
  it('preserves invalid raw working source and fixtures', () => {
    const draft = createQuestionDraft(
      {
        ...EMPTY_QUESTION_AUTHORING_STATE,
        kind: 'fixed',
        answerKind: 'working',
        name: 'Algebraic proof',
        workingSource: '[this is not valid mark-scheme source',
        workingFixtures: [{ id: 'fixture-1', studentAnswer: ['x = 2'], expectedMarks: 1 }],
      },
      123,
    );

    expect(draft.state.workingSource).toBe('[this is not valid mark-scheme source');
    expect(draft.state.workingFixtures).toEqual([
      { id: 'fixture-1', studentAnswer: ['x = 2'], expectedMarks: 1 },
    ]);
    expect(draft.timestamp).toBe(123);
  });

  it('preserves generated configuration independently from fixed fields', () => {
    const draft = createQuestionDraft(
      {
        ...EMPTY_QUESTION_AUTHORING_STATE,
        kind: 'generated',
        generatorConfig: {
          minimumRootMagnitude: 2,
          maximumRootMagnitude: 9,
          allowRepeatedRoots: true,
        },
      },
      456,
    );

    expect(draft.state.kind).toBe('generated');
    expect(draft.state.generatorConfig).toEqual({
      minimumRootMagnitude: 2,
      maximumRootMagnitude: 9,
      allowRepeatedRoots: true,
    });
  });

  it('keys new and existing Questions separately per Course', () => {
    expect(questionDraftKey('course-1')).not.toBe(questionDraftKey('course-1', 'question-1'));
    expect(questionDraftKey('course-1', 'question-1')).not.toBe(
      questionDraftKey('course-2', 'question-1'),
    );
  });
});
