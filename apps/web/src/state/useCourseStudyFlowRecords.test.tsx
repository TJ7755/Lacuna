import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { db } from '../db/schema';
import { createConcept } from '../questions/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { useCoursePathRecords, useCourseStudyFlowRecords } from './useCourseStudyFlowRecords';

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function courseWithQuestions(withCard: boolean) {
  const course = await createCourse('Biology', { learnFirst: false });
  const concept = await createConcept(course.id, 'Cells');
  if (withCard) await createCourseCard(course.id, 'front_back', 'Cell', 'Unit of life');
  await createQuestionSet({
    id: `set-${course.id}`,
    courseId: course.id,
    title: 'Cell application',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question',
        prompt: 'Explain cell structure.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'criterion',
              criterion: 'Relates structure to function.',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [concept.id],
            },
          ],
        },
      },
    ],
  });
  return course;
}

it('opens a populated path without replaying question attempts that only Study needs', async () => {
  const course = await courseWithQuestions(true);
  const attempts = vi.spyOn(db.questionSetAttempts, 'where');
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(result.current?.cards).toHaveLength(1));
    expect(attempts).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

it('still plans questions for a course with no cards or lessons so its Study entry remains available', async () => {
  const course = await courseWithQuestions(false);
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() =>
      expect(result.current?.questionPractice?.some((item) => item.availableCount === 1)).toBe(
        true,
      ),
    );
  } finally {
    unmount();
  }
});

it('keeps question planning in the active study conductor for a populated course', async () => {
  const course = await courseWithQuestions(true);
  const { result, unmount } = renderHook(() => useCourseStudyFlowRecords(course.id));
  try {
    await waitFor(() =>
      expect(result.current?.questionPractice?.some((item) => item.availableCount === 1)).toBe(
        true,
      ),
    );
  } finally {
    unmount();
  }
});
