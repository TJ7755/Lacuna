import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { db } from './schema';
import {
  createCard,
  createCourse,
  recordReview,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createNote,
  createPracticeNode,
  linkCardToLesson,
} from './repository';
import {
  buildDiagnostics,
  formatDiagnostics,
  gatherContentSample,
  gatherCounts,
} from './diagnostics';
import { diagnosticsSummary } from './read';
import { clearAll } from './read.testFixtures';

describe('buildDiagnostics', () => {
  it('assembles a well-formed bundle with no card content by default', () => {
    const bundle = buildDiagnostics({
      location: 'the Learn session',
      error: { name: 'TypeError', message: 'boom', stack: 'at x\nat y' },
      componentStack: 'in LearnMode',
      counts: { decks: 2, cards: 30, reviews: 100, backups: 3 },
      userAgent: 'TestAgent/1.0',
      language: 'en-GB',
      platform: 'TestOS',
      now: 1000,
    });

    expect(bundle.app).toBe('lacuna');
    expect(bundle.location).toBe('the Learn session');
    expect(bundle.error).toEqual({ name: 'TypeError', message: 'boom', stack: 'at x\nat y' });
    expect(bundle.componentStack).toBe('in LearnMode');
    expect(bundle.data.decks).toBe(2);
    expect(bundle.data.cards).toBe(30);
    expect(bundle.data.reviews).toBe(100);
    expect(bundle.data.backups).toBe(3);
    expect(bundle.environment.userAgent).toBe('TestAgent/1.0');
    // No content unless explicitly opted in.
    expect(bundle.contentSample).toBeUndefined();
  });

  it('includes course counts when supplied', () => {
    const bundle = buildDiagnostics({
      location: 'the Learn session',
      error: { message: 'boom' },
      counts: {
        decks: 0,
        cards: 0,
        reviews: 0,
        backups: 0,
        courses: 2,
        lessons: 5,
        notes: 10,
        lessonCards: 3,
        practiceNodes: 1,
        courseAssessments: 4,
        revisionPlans: 2,
      },
    });
    expect(bundle.data.courses).toBe(2);
    expect(bundle.data.lessons).toBe(5);
    expect(bundle.data.notes).toBe(10);
    expect(bundle.data.lessonCards).toBe(3);
    expect(bundle.data.practiceNodes).toBe(1);
    expect(bundle.data.courseAssessments).toBe(4);
    expect(bundle.data.revisionPlans).toBe(2);
  });

  it('includes a content sample only when one is supplied', () => {
    const bundle = buildDiagnostics({
      location: 'this page',
      error: { message: 'oops' },
      counts: { decks: 1, cards: 1, reviews: 0, backups: 0 },
      contentSample: [{ front: 'Q', back: 'A' }],
    });
    expect(bundle.contentSample).toEqual([{ front: 'Q', back: 'A' }]);
    expect(bundle.error.name).toBe('Error'); // defaulted
  });

  it('formats a bundle as readable text', () => {
    const text = formatDiagnostics(
      buildDiagnostics({
        location: 'the application',
        error: { name: 'Error', message: 'kaput', stack: null },
        counts: { decks: 0, cards: 0, reviews: 0, backups: 0 },
        now: 0,
      }),
    );
    expect(text).toContain('Lacuna diagnostic bundle');
    expect(text).toContain('Error: Error: kaput');
    expect(text).toContain('0 decks, 0 cards, 0 reviews, 0 restore points');
  });

  it('formats course counts in the bundle text when present', () => {
    const text = formatDiagnostics(
      buildDiagnostics({
        location: 'the application',
        error: { name: 'Error', message: 'kaput', stack: null },
        counts: {
          decks: 1,
          cards: 5,
          reviews: 10,
          backups: 2,
          courses: 3,
          lessons: 6,
          notes: 9,
          lessonCards: 2,
          practiceNodes: 1,
          courseAssessments: 4,
          revisionPlans: 2,
        },
        now: 0,
      }),
    );
    expect(text).toContain('3 courses');
    expect(text).toContain('6 lessons');
    expect(text).toContain('9 notes');
    expect(text).toContain('2 revision plans');
  });
});

describe('gatherCounts', () => {
  beforeEach(async () => {
    await Promise.all([
      db.schedulingUnits.clear(),
      db.cards.clear(),
      db.sessionHistory.clear(),
      db.userPerformance.clear(),
      db.courses.clear(),
      db.lessons.clear(),
      db.notes.clear(),
      db.lessonCards.clear(),
      db.practiceNodes.clear(),
      db.courseAssessments.clear(),
      db.revisionPlans.clear(),
      db.reviewHistory.clear(),
    ]);
  });

  it('reports real counts including total reviews', async () => {
    const deck = await createCourse('Deck');
    const card = await createCard(deck.id, 'front_back', 'q', 'a');
    await recordReview({
      card,
      eventId: 'event-diagnostics',
      sessionId: 'session-diagnostics',
      sessionKind: 'deck',
      deck,
      grade: 3,
      responseTimeSec: 2,
      distracted: false,
      correct: true,
    });

    const counts = await gatherCounts();
    expect(counts.decks).toBe(1);
    expect(counts.cards).toBe(1);
    expect(counts.reviews).toBe(1);
    expect(counts.reviewEvents).toBe(1);
    expect(counts.courses).toBe(1);
    expect(counts.lessons).toBe(0);
    expect(counts.revisionPlans).toBe(0);

    const sample = await gatherContentSample(5);
    expect(sample).toEqual([{ front: 'q', back: 'a' }]);
  });
});
describe('diagnosticsSummary', () => {
  beforeEach(clearAll);

  afterEach(() => vi.restoreAllMocks());

  it('returns whole-database counts when no courseId is given', async () => {
    const course = await createCourse('Course A');
    const lesson = await createLesson(course.id, 'Lesson 1');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');

    const summary = await diagnosticsSummary();
    expect('courseId' in summary).toBe(false);
    expect((summary as { courses: number }).courses).toBe(1);
    expect((summary as { cards: number }).cards).toBe(1);
  });

  it('scopes counts to a single course when courseId is given', async () => {
    const course = await createCourse('Course A');
    const otherCourse = await createCourse('Course B');
    const lesson = await createLesson(course.id, 'Lesson 1');
    const otherLesson = await createLesson(otherCourse.id, 'Other lesson');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q1', 'a1');
    await createLessonCard(course.id, lesson.id, 'front_back', 'q2', 'a2');
    await createLessonCard(otherCourse.id, otherLesson.id, 'front_back', 'q3', 'a3');
    await createPracticeNode(course.id, { type: 'manual', name: 'Practice' });
    await createCourseAssessment(course.id, 'Mid-term', Date.now() + 1000);

    const summary = await diagnosticsSummary(course.id);
    expect(summary).toMatchObject({
      courseId: course.id,
      lessons: 1,
      cards: 2,
      notes: 0,
      lessonCards: 0,
      practiceNodes: 1,
      courseAssessments: 2,
      sequences: 0,
    });
  });

  it('scopes to an empty course cleanly', async () => {
    const course = await createCourse('Empty course');
    const summary = await diagnosticsSummary(course.id);
    expect(summary).toMatchObject({
      courseId: course.id,
      lessons: 0,
      cards: 0,
      notes: 0,
      lessonCards: 0,
      practiceNodes: 0,
      courseAssessments: 1,
      sequences: 0,
    });
  });

  it('counts notes across lessons with one indexed query and no history hydration', async () => {
    const course = await createCourse('Biology');
    const courseLessons = [];
    for (const name of ['Cells', 'Genetics', 'Ecology']) {
      const lesson = await createLesson(course.id, name);
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'q', 'a');
      await createNote(lesson.id, name);
      courseLessons.push({ lesson, card });
    }
    await linkCardToLesson(courseLessons[0].lesson.id, courseLessons[1].card.id);
    const links = vi.spyOn(db.lessonCards, 'where');
    const notes = vi.spyOn(db.notes, 'where');
    const history = vi.spyOn(db.reviewHistory, 'where');
    expect(await diagnosticsSummary(course.id)).toMatchObject({
      lessons: 3,
      cards: 3,
      notes: 3,
      lessonCards: 1,
    });
    // One count and one scoped coverage read, independent of the number of lessons.
    expect(links).toHaveBeenCalledTimes(2);
    expect(notes).toHaveBeenCalledExactlyOnceWith('lessonId');
    expect(history).not.toHaveBeenCalled();
  });
});
