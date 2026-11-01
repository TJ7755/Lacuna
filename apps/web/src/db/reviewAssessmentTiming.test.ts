import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createLesson,
  createLessonCard,
  recordReview,
  undoReview,
} from './repository';
import { dueCards } from '../fsrs/eligibility';
import { applyReview, makeEngine } from '../fsrs/fsrs';

describe('assessment due persistence', () => {
  it('preserves ordinary due after the lesson assessment without admitting the card early; replay and undo remain intact', async () => {
    const now = Date.now();
    const examDate = now + 1000;
    const course = await createCourse('Timing', { examDate: now + 100000 });
    const lesson = await createLesson(course.id, 'Paper', { examDate });
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const ordinary = applyReview(makeEngine(course.fsrsParameters), card, 3, now).memory.due;
    expect(ordinary).toBeGreaterThan(examDate);
    const args = {
      card,
      deck: course,
      kind: 'course' as const,
      eventId: 'timing-event',
      sessionId: 'timing-session',
      sessionKind: 'lesson' as const,
      grade: 3 as const,
      responseTimeSec: 1,
      distracted: false,
      correct: false,
      now,
    };
    const result = await recordReview(args);
    expect(result.card.due).toBe(ordinary);
    expect((await db.cards.get(card.id))?.due).toBe(ordinary);
    expect(dueCards([result.card], now)).toEqual([]);
    expect(dueCards([result.card], examDate)).toEqual([]);
    expect((await recordReview(args)).recorded).toBe(false);
    await undoReview({
      ...result,
      eventId: args.eventId,
      cardBefore: result.cardBefore,
      perfBefore: null,
      deckId: course.id,
    });
    expect((await db.cards.get(card.id))?.due).toBe(card.due);
  });

  it('preserves FSRS due for a steady course', async () => {
    const now = Date.now();
    const course = await createCourse('Steady timing', { schedulingMode: 'steady' });
    const lesson = await createLesson(course.id, 'Lesson');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
    const ordinary = applyReview(makeEngine(course.fsrsParameters), card, 3, now).memory;
    const result = await recordReview({
      card,
      deck: course,
      kind: 'course',
      eventId: 'steady-event',
      sessionId: 'steady-session',
      sessionKind: 'lesson',
      grade: 3,
      responseTimeSec: 1,
      distracted: false,
      correct: false,
      now,
    });
    expect(result.card.due).toBe(ordinary.due);
    expect(result.card.stability).toBe(ordinary.stability);
    expect(result.card.scheduledDays).toBe(ordinary.scheduledDays);
  });
});
