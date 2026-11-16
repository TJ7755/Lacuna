import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import * as answerSteps from './answerSteps';
import * as lessonRepository from '../../db/lessonRepository';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cardsForSequence,
  createCourse,
  createLesson,
  createLessonCard,
  createSequence,
} from '../../db/repository';
import { db } from '../../db/schema';
import { createCourseBasicReversedPair, saveCardEdit } from '../../db/cardRepository';
import { SessionRuntime } from './sessionRuntime';
import { loadSimpleSession } from './simpleSessionPersistence';
import { resetSessionTestDatabase, sessionParams } from './useLearnSession.testFixtures';

beforeEach(resetSessionTestDatabase);
afterEach(() => vi.restoreAllMocks());

it('rolls back the review when its introduction exposure fails, then retries and undoes once', async () => {
  const course = await createCourse('Atomic introduction');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const before = await db.cards.get(card.id);
  const performanceBefore = await db.coursePerformance.toArray();
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = new SessionRuntime({
    ...params,
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current?.id).toBe(card.id));
    (() => session.getSnapshot().reveal())();
    const addExposure = vi
      .spyOn(db.lessonCardExposures, 'add')
      .mockRejectedValueOnce(new Error('Exposure failed'));
    await (async () => {
      await expect(session.getSnapshot().answer(true, { retainUndo: true })).rejects.toThrow(
        'Exposure failed',
      );
    })();
    expect(await db.cards.get(card.id)).toEqual(before);
    expect(await db.reviewHistory.count()).toBe(0);
    expect(await db.coursePerformance.toArray()).toEqual(performanceBefore);
    session.getSnapshot().persistSimpleResume();
    expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])?.events).toEqual(
      [],
    );
    expect(session.getSnapshot().phase).toBe('answer');
    addExposure.mockRestore();

    await (async () => {
      await session.getSnapshot().answer(true, { retainUndo: true });
    })();
    expect(await db.reviewHistory.count()).toBe(1);
    expect(await db.lessonCardExposures.count()).toBe(1);
    expect(session.getSnapshot().summary?.events).toEqual([
      expect.objectContaining({ cardId: card.id, correct: true }),
    ]);
    await (async () => {
      await session.getSnapshot().undoLast();
    })();
    expect(await db.reviewHistory.count()).toBe(0);
    expect(await db.lessonCardExposures.count()).toBe(0);
    expect(await db.cards.get(card.id)).toEqual(before);
    session.getSnapshot().persistSimpleResume();
    expect(loadSimpleSession({ kind: 'lesson', lessonId: lesson.id }, [card.id])?.events).toEqual(
      [],
    );
  } finally {
    session.dispose();
  }
});

it('refuses undo without removing evidence when another writer changes its exposure', async () => {
  const course = await createCourse('Concurrent exposure');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = new SessionRuntime({
    ...params,
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current?.id).toBe(card.id));
    (() => session.getSnapshot().reveal())();
    await (async () => {
      await session.getSnapshot().answer(true, { retainUndo: true });
    })();
    const key: [string, string] = [lesson.id, card.id];
    const exposure = (await db.lessonCardExposures.get(key))!;
    const changed = { ...exposure, updatedAt: exposure.updatedAt + 1 };
    await db.lessonCardExposures.put(changed);
    const reviewed = await db.cards.get(card.id);

    await (async () => {
      await session.getSnapshot().undoLast();
    })();
    expect(params.notify).toHaveBeenCalledWith(
      'The lesson exposure changed after this answer, so undo is no longer available.',
      'negative',
    );
    expect(await db.lessonCardExposures.get(key)).toEqual(changed);
    expect(await db.cards.get(card.id)).toEqual(reviewed);
    expect(await db.reviewHistory.count()).toBe(1);
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.getSnapshot().summary?.events).toEqual([
      expect.objectContaining({ cardId: card.id, correct: true }),
    ]);
  } finally {
    session.dispose();
  }
});

it('records each recited line once and exposes only mastered lines', async () => {
  const course = await createCourse('Recitation evidence');
  const lesson = await createLesson(course.id, 'Poem');
  const sequence = await createSequence(
    course.id,
    lesson.id,
    'Two lines',
    [
      { id: 'first', value: 'First line' },
      { id: 'second', value: 'Second line' },
    ],
    { mode: 'lines' },
  );
  const cards = await cardsForSequence(sequence);
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = new SessionRuntime({
    ...params,
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().recitationSequence?.id).toBe(sequence.id));
    await (async () => {
      await session.getSnapshot().answerRecitation([{ itemId: 'first', correct: false }], 12, []);
    })();
    expect(await db.reviewHistory.count()).toBe(1);
    expect(await db.lessonCardExposures.count()).toBe(0);
    await (async () => {
      await session.getSnapshot().answerRecitation(
        [
          { itemId: 'first', correct: true },
          { itemId: 'second', correct: true },
        ],
        4,
        ['first'],
      );
    })();
    expect(await db.reviewHistory.count()).toBe(2);
    expect(await db.coursePerformance.get(course.id)).toMatchObject({
      totalCorrectReviews: 1,
      runningMeanResponseTime: 4,
    });
    expect(await db.lessonCardExposures.count()).toBe(1);
    const first = cards.find((card) => card.sequenceItemId === 'first')!;
    const second = cards.find((card) => card.sequenceItemId === 'second')!;
    expect(
      loadSimpleSession(
        { kind: 'lesson', lessonId: lesson.id },
        cards.map((card) => card.id),
      ),
    ).toMatchObject({
      masteredCardIds: [first.id],
      outcomes: new Map([
        [first.id, 'correct'],
        [second.id, 'correct'],
      ]),
      events: [
        expect.objectContaining({ cardId: first.id, grade: 1, responseTimeSec: 12 }),
        expect.objectContaining({ cardId: second.id, grade: 3, responseTimeSec: 4 }),
      ],
    });
    expect(await db.reviewHistory.where('cardId').equals(first.id).first()).toMatchObject({
      grade: 1,
      responseTimeSec: 12,
    });
    expect(await db.reviewHistory.where('cardId').equals(second.id).first()).toMatchObject({
      grade: 3,
      responseTimeSec: 4,
    });
    for (const card of cards) {
      expect(await db.reviewHistory.where('cardId').equals(card.id).count()).toBe(1);
    }
  } finally {
    session.dispose();
    await db.sequences.delete(sequence.id);
  }
});

it('retries recitation mastery exposure before advancing after a failed write', async () => {
  const course = await createCourse('Recitation retry');
  const lesson = await createLesson(course.id, 'Poem');
  const sequence = await createSequence(
    course.id,
    lesson.id,
    'One line',
    [{ id: 'line', value: 'Remember this line' }],
    { mode: 'lines' },
  );
  const [card] = await cardsForSequence(sequence);
  const params = sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' });
  const session = new SessionRuntime({
    ...params,
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().recitationSequence?.id).toBe(sequence.id));
    const exposure = vi
      .spyOn(db.lessonCardExposures, 'add')
      .mockRejectedValueOnce(new Error('Exposure failed'));
    await (async () => {
      await expect(
        session.getSnapshot().answerRecitation([{ itemId: 'line', correct: true }], 4, 'all'),
      ).rejects.toThrow('Exposure failed');
    })();
    expect(await db.reviewHistory.count()).toBe(1);
    expect(await db.lessonCardExposures.count()).toBe(0);

    await (async () => {
      await session.getSnapshot().answerRecitation([{ itemId: 'line', correct: true }], 4, 'all');
    })();

    await waitFor(() => expect(session.getSnapshot().summary?.events).toHaveLength(1));
    expect(exposure).toHaveBeenCalledTimes(2);
    expect(await db.lessonCardExposures.get([lesson.id, card.id])).toBeDefined();
    expect(await db.reviewHistory.count()).toBe(1);
  } finally {
    session.dispose();
    await db.sequences.delete(sequence.id);
  }
});

it.each(['review', 'exposure'] as const)(
  'does not publish recitation progress when its %s acknowledgement arrives after disposal',
  async (write) => {
    const course = await createCourse('Disposed recitation');
    const lesson = await createLesson(course.id, 'Poem');
    const sequence = await createSequence(
      course.id,
      lesson.id,
      'One line',
      [{ id: 'line', value: 'Remember this line' }],
      { mode: 'lines' },
    );
    const session = new SessionRuntime({
      ...sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' }),
      answerInputPreference: 'course',
      leaveFlow: vi.fn(),
    });
    const changed = vi.fn();
    const unsubscribe = session.subscribe(changed);
    let release!: () => void;
    let written = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    session.start();
    try {
      await waitFor(() => expect(session.getSnapshot().recitationSequence?.id).toBe(sequence.id));
      if (write === 'review') {
        const persist = answerSteps.persistAnswer;
        vi.spyOn(answerSteps, 'persistAnswer').mockImplementationOnce(async (...args) => {
          const receipt = await persist(...args);
          written = true;
          await gate;
          return receipt;
        });
      } else {
        const persist = lessonRepository.upsertLessonCardExposure;
        vi.spyOn(lessonRepository, 'upsertLessonCardExposure').mockImplementationOnce(
          async (...args) => {
            const receipt = await persist(...args);
            written = true;
            await gate;
            return receipt;
          },
        );
      }
      const answer = session
        .getSnapshot()
        .answerRecitation([{ itemId: 'line', correct: true }], 4, 'all');
      await waitFor(() => expect(written).toBe(true));
      const before = session.getSnapshot();
      expect(before.recitationMasteredItemIds(sequence.id)).toEqual(new Set());
      session.dispose();
      changed.mockClear();
      release();
      await answer;
      expect(session.getSnapshot()).toBe(before);
      expect(changed).not.toHaveBeenCalled();
      expect(session.getSnapshot().recitationMasteredItemIds(sequence.id)).toEqual(new Set());
      expect(await db.reviewHistory.count()).toBe(1);
      expect(await db.lessonCardExposures.count()).toBe(write === 'exposure' ? 1 : 0);
    } finally {
      release();
      unsubscribe();
      session.dispose();
      await db.sequences.delete(sequence.id);
    }
  },
);

it('keeps the retry identity after a committed review loses its acknowledgement', async () => {
  const course = await createCourse('Acknowledgement');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const session = new SessionRuntime({
    ...sessionParams({ lessonId: lesson.id }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current?.id).toBe(card.id));
    session.getSnapshot().reveal();
    const persist = answerSteps.persistAnswer;
    vi.spyOn(answerSteps, 'persistAnswer').mockImplementationOnce(async (...args) => {
      await persist(...args);
      throw new Error('Acknowledgement lost');
    });
    await expect(session.getSnapshot().answer(true)).rejects.toThrow('Acknowledgement lost');
    expect(session.getSnapshot().reviewEvents).toEqual([]);
    expect(session.getSnapshot().current?.id).toBe(card.id);
    const [written] = await db.reviewHistory.toArray();
    expect(written).toBeDefined();

    await session.getSnapshot().answer(true);
    expect(await db.reviewHistory.toArray()).toEqual([written]);
    expect(session.getSnapshot().reviewEvents).toHaveLength(1);
  } finally {
    session.dispose();
  }
});

it('does not advance or notify subscribers when an acknowledged answer arrives after disposal', async () => {
  const course = await createCourse('Disposed answer');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const session = new SessionRuntime({
    ...sessionParams({ lessonId: lesson.id }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  const changed = vi.fn();
  const unsubscribe = session.subscribe(changed);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current?.id).toBe(card.id));
    session.getSnapshot().reveal();
    const persist = answerSteps.persistAnswer;
    const write = vi.spyOn(answerSteps, 'persistAnswer').mockImplementationOnce(async (...args) => {
      const receipt = await persist(...args);
      await gate;
      return receipt;
    });
    const answer = session.getSnapshot().answer(true);
    await waitFor(async () => expect(await db.reviewHistory.count()).toBe(1));
    expect(write).toHaveBeenCalledOnce();
    expect(session.getSnapshot().reviewEvents).toEqual([]);
    session.dispose();
    changed.mockClear();
    release();
    await answer;
    expect(session.getSnapshot().current?.id).toBe(card.id);
    expect(session.getSnapshot().reviewEvents).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    release();
    unsubscribe();
    session.dispose();
  }
});

it('publishes each introduction card together with its presentation serial', async () => {
  const course = await createCourse('Presentation identity');
  const lesson = await createLesson(course.id, 'Facts');
  await createLessonCard(course.id, lesson.id, 'front_back', 'First', 'One');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Second', 'Two');
  const session = new SessionRuntime({
    ...sessionParams({
      lessonId: lesson.id,
      isSimpleMode: true,
      mode: 'simple',
      introduceNewCards: true,
    }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  const presentations: { serial: number; cardId: string }[] = [];
  const unsubscribe = session.subscribe(() => {
    const snapshot = session.getSnapshot();
    if (snapshot.current && snapshot.introductionPresentation.stage === 'familiarise') {
      presentations.push({
        serial: snapshot.introductionPresentation.serial,
        cardId: snapshot.current.id,
      });
    }
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current).not.toBeNull());
    const { serial } = session.getSnapshot().introductionPresentation;
    expect(session.getSnapshot().checkIntroduction(serial, true)).toBe(true);
    session.getSnapshot().continueIntroduction(serial);
    expect(new Set(presentations.map(({ cardId }) => cardId)).size).toBe(2);
    const cardsBySerial = new Map<number, Set<string>>();
    for (const { serial, cardId } of presentations) {
      const cards = cardsBySerial.get(serial) ?? new Set<string>();
      cards.add(cardId);
      cardsBySerial.set(serial, cards);
    }
    expect([...cardsBySerial.values()].map((cards) => cards.size)).toEqual([1, 1]);
  } finally {
    unsubscribe();
    session.dispose();
  }
});

it('ignores a queued partner refresh that finishes after disposal', async () => {
  const course = await createCourse('Disposed correction');
  await createCourseBasicReversedPair(course.id, 'Question', 'Answer');
  const session = new SessionRuntime({
    ...sessionParams({
      courseId: course.id,
      isSimpleMode: true,
      standaloneSimple: true,
      mode: 'simple',
    }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  const changed = vi.fn();
  const unsubscribe = session.subscribe(changed);
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().canEditCurrent).toBe(true));
    const current = session.getSnapshot().current!;
    const updated = await saveCardEdit(current.id, {
      type: current.type,
      front: 'Corrected question',
      back: 'Corrected answer',
    });
    const partner = await db.cards.get(current.reverseCardId!);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(db.cards, 'get').mockReturnValueOnce(Dexie.Promise.resolve(gate).then(() => partner));
    const correction = session.getSnapshot().handleEdited(updated);
    session.dispose();
    changed.mockClear();
    release();
    await correction;
    expect(session.getSnapshot().current).toEqual(current);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
    session.dispose();
  }
});

it('publishes a corrected introduction together with its unchecked presentation', async () => {
  const course = await createCourse('Atomic correction');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const session = new SessionRuntime({
    ...sessionParams({
      lessonId: lesson.id,
      isSimpleMode: true,
      introduceNewCards: true,
      mode: 'simple',
    }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().canEditCurrent).toBe(true));
    const { serial } = session.getSnapshot().introductionPresentation;
    session.getSnapshot().checkIntroduction(serial, true);
    session.getSnapshot().openEdit();
    const published: ReturnType<typeof session.getSnapshot>[] = [];
    const unsubscribe = session.subscribe(() => published.push(session.getSnapshot()));
    try {
      const updated = await saveCardEdit(card.id, {
        type: card.type,
        front: 'Corrected question',
        back: 'Corrected answer',
      });
      await session.getSnapshot().handleEdited(updated);
      expect(published).toHaveLength(1);
      expect(published[0].current?.front).toBe('Corrected question');
      expect(published[0].editing).toBe(false);
      expect(published[0].introductionPresentation.serial).toBeGreaterThan(serial);
      expect(published[0].cardCompletion).toEqual({ completed: 0, total: 1 });
      expect(published[0].canUndo).toBe(false);
    } finally {
      unsubscribe();
    }
  } finally {
    session.dispose();
  }
});

it('publishes coherent completion, undo and repeat-pass snapshots', async () => {
  const course = await createCourse('Published transitions');
  const lesson = await createLesson(course.id, 'Facts');
  const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const session = new SessionRuntime({
    ...sessionParams({ lessonId: lesson.id, isSimpleMode: true, mode: 'simple' }),
    answerInputPreference: 'course',
    leaveFlow: vi.fn(),
  });
  session.start();
  try {
    await waitFor(() => expect(session.getSnapshot().current?.id).toBe(card.id));
    session.getSnapshot().reveal();
    const published: ReturnType<typeof session.getSnapshot>[] = [];
    const unsubscribe = session.subscribe(() => published.push(session.getSnapshot()));
    try {
      await session.getSnapshot().answer(true, { retainUndo: true });
      expect(published.length).toBeGreaterThan(0);
      for (const snapshot of published) {
        if (snapshot.reviewEvents.length === 0) {
          expect(snapshot.phase).toBe('answer');
          expect(snapshot.summary).toBeNull();
          expect(snapshot.canUndo).toBe(false);
          continue;
        }
        expect(snapshot.phase).toBe('finished');
        expect(snapshot.summary?.events).toHaveLength(1);
        expect(snapshot.reviewEvents).toHaveLength(1);
        expect(snapshot.canUndo).toBe(true);
        expect(snapshot.simpleProgress).toBe(1);
      }

      published.length = 0;
      await session.getSnapshot().undoLast();
      expect(published.length).toBeGreaterThan(0);
      expect(published.at(-1)?.phase).toBe('question');
      for (const snapshot of published) {
        if (snapshot.phase === 'finished') {
          expect(snapshot.summary?.events).toHaveLength(1);
          expect(snapshot.reviewEvents).toHaveLength(1);
          expect(snapshot.canUndo).toBe(true);
          continue;
        }
        expect(snapshot.phase).toBe('question');
        expect(snapshot.summary).toBeNull();
        expect(snapshot.reviewEvents).toHaveLength(0);
        expect(snapshot.canUndo).toBe(false);
        expect(snapshot.simpleProgress).toBe(0);
      }
      expect(await db.reviewHistory.count()).toBe(0);

      session.getSnapshot().reveal();
      await session.getSnapshot().answer(true, { retainUndo: true });
      published.length = 0;
      expect(await session.getSnapshot().confirmCompletion()).toBe(true);
      expect(published.at(-1)?.canUndo).toBe(false);
      expect(published.length).toBeGreaterThan(0);
      for (const snapshot of published) {
        expect(snapshot.phase).toBe('finished');
        expect(snapshot.summary?.events).toHaveLength(1);
      }

      published.length = 0;
      session.getSnapshot().continueStudying();
      expect(published.length).toBeGreaterThan(0);
      for (const snapshot of published) {
        expect(snapshot.phase).toBe('question');
        expect(snapshot.current?.id).toBe(card.id);
        expect(snapshot.summary).toBeNull();
        expect(snapshot.reviewEvents).toHaveLength(0);
        expect(snapshot.sessionCardOutcomes.size).toBe(0);
        expect(snapshot.simpleProgress).toBe(0);
      }
    } finally {
      unsubscribe();
    }
  } finally {
    session.dispose();
  }
});
