import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  createPracticeNode,
  createSequence,
  linkCardToLesson,
  createOrResumeRevisionPlan,
} from './repository';
import {
  diagnosticsSummary,
  getCard,
  getCourse,
  getCourseStats,
  getLesson,
  getSequence,
  getWeakCards,
  listCardsForCourse,
  listCardsForLesson,
  listCourseAssessments,
  listCourses,
  listDueCards,
  listLessons,
  listNotes,
  listPracticeNodes,
  listSequences,
  getRevisionPlan,
  getRevisionPlanForAssessment,
  listRevisionPlansForCourse,
} from './read';

async function clearAll(): Promise<void> {
  await Promise.all([
    db.decks.clear(),
    db.cards.clear(),
    db.courses.clear(),
    db.lessons.clear(),
    db.notes.clear(),
    db.lessonCards.clear(),
    db.practiceNodes.clear(),
    db.courseAssessments.clear(),
    db.sequences.clear(),
    db.revisionPlans.clear(),
    db.userPerformance.clear(),
  ]);
}

describe('read.ts', () => {
  beforeEach(clearAll);

  it('reads revision plans by id, assessment and course', async () => {
    const course = await createCourse('Biology');
    const assessment = await createCourseAssessment(course.id, 'Paper', Date.now() + 86_400_000);
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      20,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'missing',
      },
    );
    expect(await getRevisionPlan(plan.id)).toEqual(plan);
    expect(await getRevisionPlanForAssessment(assessment.id)).toEqual(plan);
    expect(await listRevisionPlansForCourse(course.id)).toEqual([plan]);
    expect(await getRevisionPlan('missing')).toBeNull();
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

  describe('listDueCards', () => {
    it('returns [] for a missing course', async () => {
      expect(await listDueCards('missing')).toEqual([]);
    });

    it('scopes to the course and serves due plus new cards, respecting limit', async () => {
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
      expect(ids).toEqual([dueCard.id, newCard.id].sort());
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
        })
        .then(() => 'n0');
      await db.notes.add({
        id: 'n2',
        lessonId: otherLesson.id,
        name: 'Note 2',
        content: '',
        orderIndex: 0,
        createdAt: Date.now(),
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

  describe('practice nodes / assessments', () => {
    it('scopes practice nodes and assessments to their course', async () => {
      const course = await createCourse('Course A');
      const otherCourse = await createCourse('Course B');
      const node = await createPracticeNode(course.id, { type: 'manual', name: 'Practice 1' });
      await createPracticeNode(otherCourse.id, { type: 'manual', name: 'Other practice' });

      const now = Date.now();
      const examDate = await createCourseAssessment(course.id, 'Mid-term', now + 1000);
      await createCourseAssessment(otherCourse.id, 'Other exam', now + 2000);

      expect((await listPracticeNodes(course.id)).map((n) => n.id)).toEqual([node.id]);
      expect((await listCourseAssessments(course.id)).map((e) => e.id)).toContain(examDate.id);
    });

    it('returns empty lists for a course with none', async () => {
      const course = await createCourse('Course A');
      expect(await listPracticeNodes(course.id)).toEqual([]);
      expect(await listCourseAssessments(course.id)).toHaveLength(1);
    });
  });

  describe('diagnosticsSummary', () => {
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
  });
});
