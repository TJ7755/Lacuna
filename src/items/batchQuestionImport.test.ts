import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { createCourse, createLesson } from '../db/repository';
import { createConcept } from '../questions/repository';
import { createBatchFixedQuestion } from './batchQuestionImport';

async function clearAll(): Promise<void> {
  await Promise.all([
    db.questionConcepts.clear(),
    db.questions.clear(),
    db.concepts.clear(),
    db.lessons.clear(),
    db.courseAssessments.clear(),
    db.courses.clear(),
    db.schedulingUnits.clear(),
    db.tombstones.clear(),
  ]);
}

describe('createBatchFixedQuestion', () => {
  beforeEach(clearAll);

  it('reuses named Concepts and creates missing prerequisites before one fixed Question', async () => {
    const course = await createCourse('Mathematics');
    const lesson = await createLesson(course.id, 'Algebra');
    const target = await createConcept(course.id, 'Solve linear equations');

    const created = await createBatchFixedQuestion({
      courseId: course.id,
      primaryLessonId: lesson.id,
      prompt: 'Solve 2x + 1 = 7.',
      payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '3' } },
      explanation: 'Subtract one, then divide by two.',
      targetConceptName: ' solve  linear equations ',
      prerequisiteConceptNames: ['Collect like terms'],
    });

    expect(created.question.kind).toBe('fixed');
    expect(created.concepts.targetConceptIds).toEqual([target.id]);
    const prerequisite = (await db.concepts.toArray()).find(
      (concept) => concept.name === 'Collect like terms',
    );
    expect(created.concepts.prerequisiteConceptIds).toEqual([prerequisite?.id]);
    expect(await db.cards.count()).toBe(0);
  });

  it('rolls back newly inferred Concepts when Question creation fails', async () => {
    const course = await createCourse('Mathematics');

    await expect(
      createBatchFixedQuestion({
        courseId: course.id,
        primaryLessonId: 'missing-lesson',
        prompt: 'Solve 2x + 1 = 7.',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '3' } },
        explanation: 'Subtract one, then divide by two.',
        targetConceptName: 'Solve linear equations',
        prerequisiteConceptNames: [],
      }),
    ).rejects.toThrow('Lesson');

    expect(await db.concepts.count()).toBe(0);
    expect(await db.questions.count()).toBe(0);
  });

  it('refuses an ambiguous duplicate Concept name', async () => {
    const course = await createCourse('Mathematics');
    await createConcept(course.id, 'Substitution');
    await createConcept(course.id, ' substitution ');

    await expect(
      createBatchFixedQuestion({
        courseId: course.id,
        primaryLessonId: null,
        prompt: 'Use substitution.',
        payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '2' } },
        explanation: 'Substitute and simplify.',
        targetConceptName: 'Substitution',
        prerequisiteConceptNames: [],
      }),
    ).rejects.toThrow('ambiguous');
  });
});
