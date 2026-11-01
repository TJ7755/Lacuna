import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createSequence,
  linkCardToLesson,
} from './repository';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import {
  getCard,
  getCourse,
  getCourseStats,
  getLesson,
  getSequence,
  getWeakCards,
  listCardsForCourse,
  listCardsForLesson,
  listCourses,
  listDueCards,
  listLessons,
  listNotes,
  listSequences,
  getRevisionPlanForAssessment,
  listRevisionPlansForCourse,
} from './read';
import { clearAll } from './read.testFixtures';

describe('scoped reads', () => {
  beforeEach(clearAll);

  afterEach(() => vi.restoreAllMocks());

  it('reads revision plans by assessment and course', async () => {
    const course = await createCourse('Biology');
    const assessment = await createCourseAssessment(course.id, 'Paper', Date.now() + 86_400_000);
    const plan = await createOrResumeRevisionPlan(assessment.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    expect(await getRevisionPlanForAssessment(assessment.id)).toEqual(plan);
    expect(await listRevisionPlansForCourse(course.id)).toEqual([plan]);
    expect(await getRevisionPlanForAssessment('missing')).toBeNull();
  });

  describe('courses / lessons', () => {
    it('lists and gets courses', async () => {
      const a = await createCourse('Course A');
      const b = await createCourse('Course B');

      const courses = await listCourses();
      expect(courses.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());

      expect((await getCourse(a.id))?.name).toBe('Course A');
      expect(await getCourse('missing')).toBeNull();
    });

    it('lists lessons scoped to their course, ordered by path position', async () => {
      const a = await createCourse('Course A');
      const b = await createCourse('Course B');
      const l2 = await createLesson(a.id, 'Second');
      const l1 = await createLesson(a.id, 'First');
      await db.lessons.update(l1.id, { orderIndex: 0 });
      await db.lessons.update(l2.id, { orderIndex: 1 });
      await createLesson(b.id, 'Other course lesson');

      const lessons = await listLessons(a.id);
      expect(lessons.map((l) => l.id)).toEqual([l1.id, l2.id]);

      expect((await getLesson(l1.id))?.name).toBe('First');
      expect(await getLesson('missing')).toBeNull();
    });

    it('returns an empty list for a course with no lessons', async () => {
      const course = await createCourse('Empty');
      expect(await listLessons(course.id)).toEqual([]);
    });
  });

  describe('listDueCards', () => {
    it('includes due cards already secured for a lesson exam later today', async () => {
      const course = await createCourse('Exam course');
      const lesson = await createLesson(course.id, 'Exam lesson');
      const now = Date.now();
      await db.lessons.update(lesson.id, { examDate: now + 3_600_000 });
      const card = await createLessonCard(course.id, lesson.id, 'front_back', 'due', 'answer');
      await db.cards.update(card.id, {
        state: 2,
        due: now - 1,
        stability: 2,
        lastReviewed: now - 86_400_000,
      });
      expect((await listDueCards(course.id, undefined, now)).map((card) => card.id)).toEqual([
        card.id,
      ]);
    });

    it('returns [] for a missing course', async () => {
      expect(await listDueCards('missing')).toEqual([]);
    });

    it('scopes to the course and serves only scheduled reviews, respecting limit', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const otherLesson = await createLesson(otherCourse.id, 'Other lesson');

      const now = Date.now();
      const dueCard = await createLessonCard(course.id, lesson.id, 'front_back', 'due', 'a');
      await db.cards.update(dueCard.id, { due: now - 1000, state: 2 });
      const newCard = await createLessonCard(course.id, lesson.id, 'front_back', 'new', 'a');
      const futureCard = await createLessonCard(course.id, lesson.id, 'front_back', 'future', 'a');
      await db.cards.update(futureCard.id, { due: now + 100_000_000, state: 2 });

      const otherDue = await createLessonCard(
        otherCourse.id,
        otherLesson.id,
        'front_back',
        'other',
        'a',
      );
      await db.cards.update(otherDue.id, { due: now - 1000, state: 2 });

      const result = await listDueCards(course.id, undefined, now);
      const ids = result.map((c) => c.id).sort();
      expect(ids).toEqual([dueCard.id]);
      expect(ids).not.toContain(newCard.id);
      expect(ids).not.toContain(futureCard.id);
      expect(ids).not.toContain(otherDue.id);

      const limited = await listDueCards(course.id, 1, now);
      expect(limited).toHaveLength(1);
    });
  });

  describe('getWeakCards', () => {
    it('returns [] for a missing course', async () => {
      expect(await getWeakCards('missing')).toEqual([]);
    });

    it('ranks leeches first, then respects limit and course scope', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const otherLesson = await createLesson(otherCourse.id, 'Other lesson');

      const healthy = await createLessonCard(course.id, lesson.id, 'front_back', 'healthy', 'a');
      const leech = await createLessonCard(course.id, lesson.id, 'front_back', 'leech', 'a');
      await db.cards.update(leech.id, { lapses: 10, state: 2, due: Date.now() });
      await createLessonCard(otherCourse.id, otherLesson.id, 'front_back', 'other', 'a');

      const weak = await getWeakCards(course.id);
      expect(weak.map((w) => w.card.id).sort()).toEqual([healthy.id, leech.id].sort());
      expect(weak[0].card.id).toBe(leech.id);
      expect(weak[0].leech).toBe(true);

      const limited = await getWeakCards(course.id, 1);
      expect(limited).toHaveLength(1);
      expect(limited[0].card.id).toBe(leech.id);
    });
  });

  describe('getCourseStats', () => {
    it('returns null for a missing course', async () => {
      expect(await getCourseStats('missing')).toBeNull();
    });

    it('scopes lesson/card counts to the course', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const otherLesson = await createLesson(otherCourse.id, 'Other lesson');
      await createLessonCard(course.id, lesson.id, 'front_back', 'q1', 'a1');
      await createLessonCard(course.id, lesson.id, 'front_back', 'q2', 'a2');
      await createLessonCard(otherCourse.id, otherLesson.id, 'front_back', 'q3', 'a3');

      const stats = await getCourseStats(course.id);
      expect(stats).not.toBeNull();
      expect(stats!.lessonCount).toBe(1);
      expect(stats!.cardCount).toBe(2);
      expect(stats!.header).toBeDefined();
      expect(stats!.studyStats).toBeDefined();
    });
  });

  describe('sequences', () => {
    it('lists and gets sequences scoped to the course', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const seq = await createSequence(course.id, null, 'Seq A', [
        { id: 'i1', value: 'one' },
        { id: 'i2', value: 'two' },
      ]);
      await createSequence(otherCourse.id, null, 'Seq B', [{ id: 'j1', value: 'one' }]);

      const sequences = await listSequences(course.id);
      expect(sequences.map((s) => s.id)).toEqual([seq.id]);

      expect((await getSequence(seq.id))?.name).toBe('Seq A');
      expect(await getSequence('missing')).toBeNull();
    });

    it('returns an empty list for a course with no sequences', async () => {
      const course = await createCourse('Course A');
      expect(await listSequences(course.id)).toEqual([]);
    });
  });

  describe('notes', () => {
    it('lists notes scoped to the lesson, ordered by position', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Lesson 1');
      const otherLesson = await createLesson(course.id, 'Lesson 2');
      const note1 = await db.notes
        .add({
          id: 'n1',
          lessonId: lesson.id,
          name: 'Note 1',
          content: '',
          orderIndex: 1,
          createdAt: Date.now(),
          updatedAt: 1,
        })
        .then(() => 'n1');
      const note0 = await db.notes
        .add({
          id: 'n0',
          lessonId: lesson.id,
          name: 'Note 0',
          content: '',
          orderIndex: 0,
          createdAt: Date.now(),
          updatedAt: 1,
        })
        .then(() => 'n0');
      await db.notes.add({
        id: 'n2',
        lessonId: otherLesson.id,
        name: 'Note 2',
        content: '',
        orderIndex: 0,
        createdAt: Date.now(),
        updatedAt: 1,
      });

      const notes = await listNotes(lesson.id);
      expect(notes.map((n) => n.id)).toEqual([note0, note1]);
    });

    it('returns an empty list for a lesson with no notes', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Empty lesson');
      expect(await listNotes(lesson.id)).toEqual([]);
    });
  });

  describe('cards', () => {
    it('scopes listCardsForCourse to its own course', async () => {
      const a = await createCourse('Course A');
      const b = await createCourse('Course B');
      const lessonA = await createLesson(a.id, 'Lesson A');
      const lessonB = await createLesson(b.id, 'Lesson B');
      const cardA = await createLessonCard(a.id, lessonA.id, 'front_back', 'qa', 'aa');
      await createLessonCard(b.id, lessonB.id, 'front_back', 'qb', 'ab');

      const cardsA = await listCardsForCourse(a.id);
      expect(cardsA.map((c) => c.id)).toEqual([cardA.id]);

      expect((await getCard(cardA.id))?.front).toBe('qa');
      expect(await getCard('missing')).toBeNull();
    });

    it('lists lesson cards as primary plus linked, de-duplicated', async () => {
      const course = await createCourse('Course A');
      const lesson1 = await createLesson(course.id, 'Lesson 1');
      const lesson2 = await createLesson(course.id, 'Lesson 2');
      const primary = await createLessonCard(course.id, lesson1.id, 'front_back', 'q1', 'a1');
      const linked = await createLessonCard(course.id, lesson2.id, 'front_back', 'q2', 'a2');
      await linkCardToLesson(lesson1.id, linked.id);

      const cards = await listCardsForLesson(lesson1.id);
      expect(cards.map((c) => c.id).sort()).toEqual([primary.id, linked.id].sort());

      // No duplicate entries even though `linked` matches both the link and (via
      // its own lesson2) would be found again if queried loosely.
      expect(cards.filter((c) => c.id === linked.id)).toHaveLength(1);
    });

    it('returns an empty list for a lesson with no cards', async () => {
      const course = await createCourse('Course A');
      const lesson = await createLesson(course.id, 'Empty lesson');
      expect(await listCardsForLesson(lesson.id)).toEqual([]);
    });
  });
});
