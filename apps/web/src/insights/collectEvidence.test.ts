import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createCourseCard } from '../db/repository';
import type { QuestionAttempt } from '@lacuna/core/questions/types';
import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import { collectDailyEvidence } from './collectEvidence';
import { parseDailyEvidence } from './evidence';

beforeEach(async () => {
  await db.delete();
  await db.open();
});
const shareId = 'a'.repeat(32),
  day = '2026-10-18',
  at = Date.parse(`${day}T12:00:00Z`);
const pupil = { id: 'b'.repeat(32), label: 'Pupil A' };
it('reads only completed evidence for this course and UTC day, excluding undone attempts', async () => {
  const course = await createCourse('Biology'),
    other = await createCourse('Private');
  const card = await createCourseCard(course.id, 'front_back', 'Membranes', 'Water');
  const attempt = {
    id: 'attempt',
    courseId: course.id,
    questionId: 'question',
    status: 'answered',
    receiptOrigin: 'native',
    shownAt: at - 10,
    answeredAt: at,
    undoneAt: undefined,
    contentVersion: 1,
    renderedPrompt: 'Explain osmosis.',
    submittedAnswer: 'Water crosses a membrane.',
    marksEarned: 1,
    marksAvailable: 2,
    resolvedPayload: { kind: 'numeric' },
    lineVerdicts: [],
    updatedAt: at,
  } as unknown as QuestionAttempt;
  await db.questionAttempts.bulkAdd([
    attempt,
    { ...attempt, id: 'undone', undoneAt: at + 1 },
    { ...attempt, id: 'tomorrow', answeredAt: at + 86400000 },
    { ...attempt, id: 'other', courseId: other.id },
    {
      ...attempt,
      id: 'migrated',
      receiptOrigin: 'legacy-reconstructed',
      historicalPresentationKnown: false,
      renderedPrompt: 'A later reconstructed prompt',
    },
  ]);
  await db.reviewHistory.add({
    id: 'review',
    cardId: card.id,
    courseId: course.id,
    timestamp: at,
    grade: 3,
    correct: true,
    responseTimeSec: 2,
    distracted: false,
    stabilityBefore: null,
    stabilityAfter: 2,
    difficultyBefore: null,
    difficultyAfter: 3,
    retrievabilityAtReview: null,
  });
  const report = parseDailyEvidence(
    await collectDailyEvidence({ courseId: course.id, shareId, day, pupil }),
    { shareId, day },
  );
  expect(report.events).toHaveLength(2);
  expect(report.events.find((event) => event.kind === 'question')).toMatchObject({
    prompt: 'Explain osmosis.',
    answer: 'Water crosses a membrane.',
    earned: 1,
    available: 2,
  });
  expect(report.events.find((event) => event.kind === 'card')).toMatchObject({
    retained: true,
    conceptIds: [card.conceptId],
  });
  expect(report.omitted).toBe(0);
});

it('uses selected option text from the immutable paper receipt and labels unknown identifiers', async () => {
  const course = await createCourse('Biology');
  await db.questionSetAttempts.add({
    id: 'paper',
    courseId: course.id,
    status: 'complete',
    completedAt: at,
    receipt: {
      questions: [
        {
          id: 'mcq',
          prompt: 'Choose a substance.',
          parts: [],
          answer: {
            maxMarks: 1,
            response: { kind: 'multiple-choice', options: [{ id: 'o1', content: 'Water' }] },
            allocations: [
              { id: 'criterion', criterion: 'Identify water', maxMarks: 1, targetConceptIds: [] },
            ],
          },
        },
      ],
    },
    responses: [
      {
        nodeId: 'mcq',
        submitted: { kind: 'multiple-choice', selectedOptionIds: ['o1', 'missing'] },
      },
    ],
    decisions: [{ allocationId: 'criterion', status: 'unsure' }],
  } as unknown as QuestionSetAttemptRecord);
  const report = parseDailyEvidence(
    await collectDailyEvidence({ courseId: course.id, shareId, day, pupil }),
    { shareId, day },
  );
  expect(report.events[0]).toMatchObject({
    answer: 'o1: Water\nUnknown option: missing',
    earned: null,
    available: 1,
    marking: 'self',
    criteria: [{ earned: null, available: 1 }],
  });
});
it('caps activity and text without changing marks or pretending the report is complete', async () => {
  const course = await createCourse('Biology');
  await db.questionAttempts.bulkAdd(
    Array.from(
      { length: 110 },
      (_, i) =>
        ({
          id: `attempt-${i}`,
          courseId: course.id,
          questionId: 'question',
          status: 'answered',
          shownAt: at,
          answeredAt: at,
          contentVersion: 1,
          renderedPrompt: 'x'.repeat(5000),
          submittedAnswer: 'y'.repeat(10000),
          marksEarned: 1,
          marksAvailable: 2,
          resolvedPayload: { kind: 'numeric' },
          updatedAt: at,
        }) as unknown as QuestionAttempt,
    ),
  );
  const bytes = await collectDailyEvidence({ courseId: course.id, shareId, day, pupil });
  const report = parseDailyEvidence(bytes, { shareId, day });
  expect(bytes.byteLength).toBeLessThanOrEqual(65536);
  expect(report.omitted).toBeGreaterThan(0);
  expect(
    report.events.every((row) => row.shortened && row.earned === 1 && row.available === 2),
  ).toBe(true);
});
