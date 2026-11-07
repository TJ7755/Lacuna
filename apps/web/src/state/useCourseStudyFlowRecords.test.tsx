import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCourse, createCourseCard } from '../db/repository';
import { createLesson } from '../db/lessonRepository';
import { db } from '../db/schema';
import { createConcept } from '../questions/repository';
import { createQuestionSet } from '../questions/questionSetRepository';
import { useCoursePathRecords, useCourseStudyFlowRecords } from './useCourseStudyFlowRecords';
import { reviewHistoryEntryForCard } from '@lacuna/core/db/reviewHistory';
import type { Card, ReviewLog } from '@lacuna/core/db/types';

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((table) => table.clear()));
});

const review = (timestamp: number, eventId = 'review'): ReviewLog => ({
  eventId,
  timestamp,
  grade: 3,
  responseTimeSec: 4,
  distracted: false,
  stabilityBefore: null,
  stabilityAfter: 2,
  difficultyBefore: null,
  difficultyAfter: 5,
  retrievabilityAtReview: null,
});

it.each([
  ['Path', useCoursePathRecords],
  ['Study', useCourseStudyFlowRecords],
] as const)(
  'bulk-reads %s exposures in index order and observes changes',
  async (_name, useRecords) => {
    const course = await createCourse('Exposure reads');
    const other = await createCourse('Other course');
    const last = await createLesson(course.id, 'First in course', { id: 'lesson-z' });
    const first = await createLesson(course.id, 'Last in course', { id: 'lesson-a' });
    const outside = await createLesson(other.id, 'Outside');
    const card = await createCourseCard(course.id, 'front_back', 'Linked card', 'Answer');
    await db.lessonCardExposures.bulkPut(
      [last, first, outside].map((lesson) => ({
        lessonId: lesson.id,
        cardId: card.id,
        taughtAt: 100,
        updatedAt: 100,
      })),
    );
    const expected = await db.lessonCardExposures
      .where('lessonId')
      .anyOf([last.id, first.id])
      .toArray();
    const openCursor = IDBIndex.prototype.openCursor;
    let exposureCursors = 0;
    vi.spyOn(IDBIndex.prototype, 'openCursor').mockImplementation(function (
      this: IDBIndex,
      ...args
    ) {
      if (this.objectStore.name === 'lessonCardExposures') exposureCursors++;
      return openCursor.apply(this, args);
    });
    const { result, unmount } = renderHook(() => useRecords(course.id));
    try {
      await waitFor(() => expect(result.current?.exposures).toEqual(expected));
      expect(exposureCursors).toBe(0);
      await db.lessonCardExposures.update([first.id, card.id], { taughtAt: 200 });
      await waitFor(() => expect(result.current?.exposures[0].taughtAt).toBe(200));
      await db.lessonCardExposures.delete([last.id, card.id]);
      await waitFor(() => expect(result.current?.exposures).toHaveLength(1));
      expect(result.current?.exposures[0].lessonId).toBe(first.id);
    } finally {
      unmount();
    }
  },
);

it('reads timestamps for a populated Path without loading any full review histories', async () => {
  const course = await createCourse('Mature course');
  const template = await createCourseCard(course.id, 'front_back', 'Cell', 'Answer');
  const cards = [
    template,
    ...Array.from({ length: 99 }, (_, i) => ({
      ...template,
      id: `${course.id}-card-${i}`,
    })),
  ];
  await db.cards.bulkPut(cards);
  await db.reviewHistory.bulkPut(
    cards.map((card, i) => ({
      ...reviewHistoryEntryForCard(card, review(100 + i, `review-${i}`)),
      courseId: 'historical-course',
    })),
  );
  const histories = vi.spyOn(db.reviewHistory, 'where');
  const timestamps = vi.spyOn(db.reviewActivity, 'toArray');
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(result.current?.cards).toHaveLength(100));
    expect(histories).not.toHaveBeenCalled();
    expect(timestamps).toHaveBeenCalledOnce();
    expect(result.current?.activity?.get(template.id)).toEqual([100]);
    expect(result.current?.cards.every((card) => card.history.length === 0)).toBe(true);
  } finally {
    unmount();
  }
});

it('shares a warm course card read with another live route', async () => {
  const course = await createCourse('Warm course');
  await createCourseCard(course.id, 'front_back', 'Cell', 'Answer');
  const cards = renderHook(() =>
    useLiveQuery(() => db.cards.where('courseId').equals(course.id).toArray()),
  );
  await waitFor(() => expect(cards.result.current).toHaveLength(1));

  const getAll = IDBIndex.prototype.getAll;
  const readCards = vi.fn();
  vi.spyOn(IDBIndex.prototype, 'getAll').mockImplementation(function (this: IDBIndex, ...args) {
    if (this.objectStore.name === 'cards') readCards();
    return getAll.apply(this, args);
  });
  const path = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(path.result.current?.cards).toHaveLength(1));
    expect(readCards).not.toHaveBeenCalled();
  } finally {
    path.unmount();
    cards.unmount();
  }
});

it('updates Path activity after canonical reviews and undo removals without hydrating logs', async () => {
  const course = await createCourse('Reactive history');
  const card = await createCourseCard(course.id, 'front_back', 'Cell', 'Answer');
  const histories = vi.spyOn(db.reviewHistory, 'where');
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(result.current?.cards).toHaveLength(1));
    const entry = reviewHistoryEntryForCard(card, review(200));
    await db.reviewHistory.add(entry);
    await waitFor(() => expect(result.current?.activity?.get(card.id)).toEqual([200]));
    await db.reviewHistory.delete(entry.id);
    await waitFor(() => expect(result.current?.activity?.has(card.id)).toBe(false));
    expect(histories).not.toHaveBeenCalled();
  } finally {
    unmount();
  }
});

it('keeps daily attempt limits on historical ownership independently of current-card activity', async () => {
  const course = await createCourse('Daily limit', { dailyReviewGoal: 2 });
  const other = await createCourse('Other course');
  const current = await createCourseCard(course.id, 'front_back', 'Current', 'Answer');
  const moved = await createCourseCard(other.id, 'front_back', 'Moved away', 'Answer');
  const now = Date.now();
  await db.reviewHistory.bulkPut([
    { ...reviewHistoryEntryForCard(current, review(now, 'old-owner-1')), courseId: other.id },
    { ...reviewHistoryEntryForCard(current, review(now, 'old-owner-2')), courseId: other.id },
    { ...reviewHistoryEntryForCard(moved, review(now, 'this-owner')), courseId: course.id },
  ]);
  const histories = vi.spyOn(db.reviewHistory, 'where');
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(result.current?.reviewsToday).toBe(1));
    expect(result.current?.activity?.get(current.id)).toEqual([now, now]);
    expect(histories).toHaveBeenCalledExactlyOnceWith('timestamp');
  } finally {
    unmount();
  }
});

it('merges legacy history only for the affected card, preserving canonical precedence and duplicates', async () => {
  const course = await createCourse('Legacy evidence');
  const first = await createCourseCard(course.id, 'front_back', 'Legacy', 'Answer');
  await createCourseCard(course.id, 'front_back', 'Modern', 'Answer');
  await db.reviewHistory.add(reviewHistoryEntryForCard(first, review(100)));
  const legacy: Card = {
    ...first,
    history: [review(999), review(200, 'legacy'), review(200, 'legacy')],
  };
  // Supported old records can retain a projection; current Dexie writes deliberately strip it.
  await new Promise<void>((resolve, reject) => {
    const transaction = db.backendDB().transaction('cards', 'readwrite');
    transaction.objectStore('cards').put(legacy);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  const histories = vi.spyOn(db.reviewHistory, 'where');
  const { result, unmount } = renderHook(() => useCoursePathRecords(course.id));
  try {
    await waitFor(() => expect(result.current?.cards).toHaveLength(2));
    expect(histories).toHaveBeenCalledExactlyOnceWith('cardId');
    expect(result.current?.activity?.get(first.id)).toEqual([100, 200, 200]);
  } finally {
    unmount();
  }
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
  const card = (await db.cards.where('courseId').equals(course.id).first())!;
  await db.reviewHistory.add(reviewHistoryEntryForCard(card, review(100)));
  const { result, unmount } = renderHook(() => useCourseStudyFlowRecords(course.id));
  try {
    await waitFor(() =>
      expect(result.current?.questionPractice?.some((item) => item.availableCount === 1)).toBe(
        true,
      ),
    );
    expect(result.current?.cards[0].history.map((entry) => entry.timestamp)).toEqual([100]);
    expect(result.current?.activity).toBeUndefined();
  } finally {
    unmount();
  }
});
