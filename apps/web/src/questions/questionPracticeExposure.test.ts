import { expect, it } from 'vitest';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { latestQuestionPracticeExposure } from './questionPracticeExposure';

it('retains submitted exposure after assistance, unresolved marking and undo without treating hidden questions as practised', () => {
  const attempt: QuestionSetAttemptRecord = {
    id: 'a',
    courseId: 'c',
    questionSetId: 's',
    mode: 'practice',
    status: 'complete',
    responses: [
      {
        nodeId: 'q',
        draft: { kind: 'written', text: 'Answer' },
        submitted: { kind: 'written', text: 'Answer' },
        submittedAt: 20,
      },
    ],
    decisions: [],
    annotations: [],
    corrections: [],
    reflection: { reasons: [], note: '' },
    assistance: [{ nodeId: 'q', kind: 'answer-revealed', occurredAt: 10 }],
    revealedQuestionIds: ['q'],
    activeNodeId: 'q',
    activeAllocationId: null,
    revisionId: 'r',
    createdAt: 1,
    updatedAt: 30,
    undoneAt: 40,
    receipt: {
      id: 's',
      courseId: 'c',
      title: 'Questions',
      lessonIds: [],
      assessmentIds: [],
      contentVersion: 1,
      contentRevisionId: 'v1',
      createdAt: 1,
      updatedAt: 1,
      questions: ['q', 'hidden'].map((id) => ({
        id,
        prompt: id,
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: `${id}-a`,
              criterion: 'Link evidence',
              dimension: 'application',
              maxMarks: 1,
              targetConceptIds: [id],
              techniqueTags: {
                taxonomyId: 'science-techniques',
                taxonomyVersion: 1,
                provenance: { source: 'author' },
                techniqueIds: ['causal-link'],
              },
            },
          ],
        },
      })),
    },
  };
  const result = latestQuestionPracticeExposure([attempt]);
  expect([...result.concepts]).toEqual([['q', 30]]);
  expect([...result.techniques]).toEqual([['causal-link', 30]]);
  expect(latestQuestionPracticeExposure([{ ...attempt, mode: 'paper' }]).concepts.size).toBe(0);
});
