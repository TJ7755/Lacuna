import { describe, expect, it } from 'vitest';
import type { QuestionSetAttemptRecord } from './questionSetAttempts';
import { questionSetPathProgress } from './questionSetPathProgress';

function attempt(): QuestionSetAttemptRecord {
  return {
    id: 'attempt-1',
    courseId: 'course-1',
    questionSetId: 'set-1',
    receipt: {
      id: 'set-1',
      courseId: 'course-1',
      title: 'Historical version',
      lessonIds: [],
      assessmentIds: [],
      contentVersion: 1,
      contentRevisionId: 'content-1',
      createdAt: 1,
      updatedAt: 1,
      questions: [
        {
          id: 'question-1',
          prompt: 'Question with an answer.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'written' },
            prerequisiteConceptIds: [],
            allocations: [
              {
                id: 'allocation-1',
                criterion: 'Names it.',
                maxMarks: 1,
                dimension: 'knowledge',
                targetConceptIds: [],
              },
            ],
          },
        },
        {
          id: 'question-2',
          prompt: 'Question with children.',
          parts: [
            {
              id: 'part-1',
              prompt: 'Choose the correct option.',
              subparts: [],
              answer: {
                maxMarks: 2,
                response: {
                  kind: 'multiple-choice',
                  selection: 'multiple',
                  options: [
                    { id: 'option-1', content: 'First' },
                    { id: 'option-2', content: 'Second' },
                  ],
                  correctOptionIds: ['option-1'],
                },
                prerequisiteConceptIds: [],
                allocations: [
                  {
                    id: 'allocation-2',
                    criterion: 'First criterion.',
                    maxMarks: 1,
                    dimension: 'knowledge',
                    targetConceptIds: [],
                  },
                  {
                    id: 'allocation-3',
                    criterion: 'Second criterion.',
                    maxMarks: 1,
                    dimension: 'application',
                    targetConceptIds: [],
                  },
                ],
              },
            },
            {
              id: 'part-2',
              prompt: 'Shared context only.',
              subparts: [
                {
                  id: 'subpart-1',
                  prompt: 'Explain the result.',
                  answer: {
                    maxMarks: 1,
                    response: { kind: 'calculation' },
                    prerequisiteConceptIds: [],
                    allocations: [
                      {
                        id: 'allocation-4',
                        criterion: 'Explains the result.',
                        maxMarks: 1,
                        dimension: 'application',
                        targetConceptIds: [],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        { id: 'question-3', prompt: 'Context without an answer.', parts: [] },
      ],
    },
    mode: 'practice',
    status: 'marking',
    responses: [
      { nodeId: 'question-1', draft: { kind: 'written', text: ' Nucleus ' } },
      {
        nodeId: 'part-1',
        draft: { kind: 'multiple-choice', selectedOptionIds: ['option-1'] },
        submitted: { kind: 'multiple-choice', selectedOptionIds: [] },
        submittedAt: 10,
      },
      {
        nodeId: 'subpart-1',
        draft: { kind: 'calculation', text: '42' },
        submitted: { kind: 'calculation', text: '  ' },
        submittedAt: 10,
      },
    ],
    decisions: [
      { allocationId: 'allocation-1', status: 'awarded', marks: 0 },
      { allocationId: 'allocation-2', status: 'awarded', marks: 1 },
      { allocationId: 'allocation-3', status: 'unsure' },
      { allocationId: 'allocation-4', status: 'unsure' },
    ],
    annotations: [],
    corrections: [{ nodeId: 'question-1', content: 'Corrected response.', updatedAt: 20 }],
    reflection: { reasons: [], note: '' },
    assistance: [],
    revealedQuestionIds: [],
    activeNodeId: 'question-1',
    activeAllocationId: null,
    revisionId: 'revision-1',
    createdAt: 1,
    updatedAt: 20,
  } as QuestionSetAttemptRecord;
}

describe('questionSetPathProgress', () => {
  it('returns null when there is no attempt', () => {
    expect(questionSetPathProgress(null)).toBeNull();
  });

  it('counts answerable leaves in the pinned receipt and requires every allocation to be awarded', () => {
    expect(questionSetPathProgress(attempt())).toEqual({
      totalParts: 3,
      answeredParts: 1,
      markedParts: 1,
    });
  });

  it('counts nonblank drafts when no original was submitted, including selected options and calculation text', () => {
    const current = attempt();
    current.responses = current.responses.map((response) => ({
      nodeId: response.nodeId,
      draft:
        response.nodeId === 'part-1'
          ? { kind: 'multiple-choice', selectedOptionIds: ['option-2'] }
          : response.nodeId === 'subpart-1'
            ? { kind: 'calculation', text: '  42  ' }
            : { kind: 'written', text: '  ' },
    }));

    expect(questionSetPathProgress(current)).toEqual({
      totalParts: 3,
      answeredParts: 2,
      markedParts: 1,
    });
  });
});
