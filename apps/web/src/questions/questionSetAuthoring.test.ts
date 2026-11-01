import { describe, expect, it } from 'vitest';
import {
  addQuestionSetNode,
  flattenQuestionSet,
  moveQuestionSetNode,
  removeQuestionSetNode,
  updateQuestionSetNodeAnswer,
  updateQuestionSetNodePrompt,
} from './questionSetAuthoring';
import type { QuestionSet } from './questionSets';

function fixture(): QuestionSet {
  return {
    id: 'set',
    courseId: 'course',
    title: 'Paper',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Question',
        parts: [
          {
            id: 'p1',
            prompt: 'Part',
            subparts: [
              { id: 's1', prompt: 'First' },
              { id: 's2', prompt: 'Second' },
            ],
          },
          { id: 'p2', prompt: 'Part two', subparts: [] },
        ],
      },
      { id: 'q2', prompt: 'Question two', parts: [] },
    ],
  };
}

describe('Question Set authoring tree', () => {
  it('flattens the tree in paper order with dynamic labels and ancestry', () => {
    expect(
      flattenQuestionSet(fixture()).map(({ id, label, parentIds, depth }) => ({
        id,
        label,
        parentIds,
        depth,
      })),
    ).toEqual([
      { id: 'q1', label: 'Q1', parentIds: [], depth: 0 },
      { id: 'p1', label: '(a)', parentIds: ['q1'], depth: 1 },
      { id: 's1', label: '(i)', parentIds: ['q1', 'p1'], depth: 2 },
      { id: 's2', label: '(ii)', parentIds: ['q1', 'p1'], depth: 2 },
      { id: 'p2', label: '(b)', parentIds: ['q1'], depth: 1 },
      { id: 'q2', label: 'Q2', parentIds: [], depth: 0 },
    ]);
  });

  it('updates prompts and answers immutably at every depth', () => {
    const original = fixture();
    const answer = {
      maxMarks: 1,
      response: { kind: 'written' as const },
      allocations: [
        {
          id: 'a1',
          criterion: 'Correct',
          maxMarks: 1,
          dimension: 'knowledge' as const,
          targetConceptIds: [],
        },
      ],
      prerequisiteConceptIds: [],
    };
    const prompted = updateQuestionSetNodePrompt(original, 's1', 'Changed');
    const answered = updateQuestionSetNodeAnswer(prompted, 'p2', answer);

    expect(original.questions[0].parts[0].subparts[0].prompt).toBe('First');
    expect(answered.questions[0].parts[0].subparts[0].prompt).toBe('Changed');
    expect(answered.questions[0].parts[1].answer).toEqual(answer);
  });

  it('routes structural operations through the bounded editing helpers', () => {
    let set = addQuestionSetNode(fixture(), { parentIds: ['q2'], id: 'p3' });
    set = addQuestionSetNode(set, { parentIds: ['q2', 'p3'], id: 's3' });
    set = moveQuestionSetNode(set, 'q2', 0);
    set = removeQuestionSetNode(set, 'p3');

    expect(set.questions.map(({ id }) => id)).toEqual(['q2', 'q1']);
    expect(set.questions[0].parts).toEqual([]);
    expect(() => addQuestionSetNode(set, { parentIds: ['q1', 'p1', 's1'] })).toThrow(
      'cannot be nested',
    );
  });
});
