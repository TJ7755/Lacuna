import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createCourse,
  createCourseAssessment,
  createLesson,
  createLessonCard,
  deleteCourseAssessment,
  updateCourseAssessment,
} from './repository';
import { createOrResumeRevisionPlan } from './revisionPlanRepository';
import { reset } from './courseRepository.testFixtures';

describe('course assessment repository', () => {
  beforeEach(reset);

  it('stores checkpoints that can be ordered by examDate', async () => {
    const course = await createCourse('Assessments test');
    const t1 = Date.now() + 10 * 86400000;
    const t2 = Date.now() + 30 * 86400000;
    const t3 = Date.now() + 5 * 86400000;
    const d1 = await createCourseAssessment(course.id, 'Late', t1);
    const d2 = await createCourseAssessment(course.id, 'Later', t2);
    const d3 = await createCourseAssessment(course.id, 'Soon', t3);

    const dates = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .filter((assessment) => assessment.kind === 'checkpoint')
      .sortBy('examDate');
    expect(dates.map((d) => d.id)).toEqual([d3.id, d1.id, d2.id]);
  });

  it('defaults checkpoints to explicit prefix coverage', async () => {
    const course = await createCourse('Assessments test');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);

    expect(checkpoint).toMatchObject({
      kind: 'checkpoint',
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
    });
    expect(checkpoint).not.toHaveProperty('lessonIds');
  });

  it('stores independent custom coverage, placement and exclusions', async () => {
    const course = await createCourse('Assessments test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    const card = await createLessonCard(course.id, lesson1.id, 'front_back', 'q', 'a');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000, {
      afterLessonId: lesson2.id,
      coverageMode: 'custom',
      lessonIds: [lesson1.id],
      excludedCardIds: [card.id],
    });

    expect(checkpoint).toMatchObject({
      afterLessonId: lesson2.id,
      coverageMode: 'custom',
      lessonIds: [lesson1.id],
      excludedCardIds: [card.id],
    });
  });

  it('infers compatible placement without conflating it with coverage', async () => {
    const course = await createCourse('Assessments test');
    const lesson1 = await createLesson(course.id, 'L1');
    const lesson2 = await createLesson(course.id, 'L2');
    const lesson3 = await createLesson(course.id, 'L3');

    const prefix = await createCourseAssessment(course.id, 'Prefix', Date.now() + 86_400_000);
    const custom = await createCourseAssessment(course.id, 'Custom', Date.now() + 172_800_000, {
      coverageMode: 'custom',
      lessonIds: [lesson1.id, lesson2.id],
    });

    expect(prefix).toMatchObject({ coverageMode: 'prefix', afterLessonId: lesson3.id });
    expect(custom).toMatchObject({
      coverageMode: 'custom',
      lessonIds: [lesson1.id, lesson2.id],
      afterLessonId: lesson2.id,
    });
  });

  it('rejects structurally ambiguous or duplicate coverage', async () => {
    const course = await createCourse('Assessments test');

    await expect(
      createCourseAssessment(course.id, 'Bad prefix', Date.now(), {
        coverageMode: 'prefix',
        lessonIds: ['lesson-1'],
      } as never),
    ).rejects.toThrow('Prefix assessment coverage cannot store lesson ids');
    await expect(
      createCourseAssessment(course.id, 'Empty custom', Date.now(), {
        coverageMode: 'custom',
        lessonIds: [],
      }),
    ).rejects.toThrow('requires an explicit lesson-id array');
    await expect(
      createCourseAssessment(course.id, 'Duplicate custom', Date.now(), {
        coverageMode: 'custom',
        lessonIds: ['lesson-1', 'lesson-1'],
      }),
    ).rejects.toThrow('cannot contain duplicate lesson ids');
  });

  it('rejects missing, cross-course and future lesson references', async () => {
    const course = await createCourse('Assessment validation');
    const otherCourse = await createCourse('Other course');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const foreign = await createLesson(otherCourse.id, 'Foreign');

    await expect(
      createCourseAssessment(course.id, 'Missing anchor', Date.now(), {
        afterLessonId: 'missing',
      }),
    ).rejects.toThrow('placement lesson missing could not be found');
    await expect(
      createCourseAssessment(course.id, 'Foreign lesson', Date.now(), {
        afterLessonId: first.id,
        coverageMode: 'custom',
        lessonIds: [foreign.id],
      }),
    ).rejects.toThrow('belongs to another course');
    await expect(
      createCourseAssessment(course.id, 'Future lesson', Date.now(), {
        afterLessonId: first.id,
        coverageMode: 'custom',
        lessonIds: [second.id],
      }),
    ).rejects.toThrow('positioned after the assessment');
  });

  it('rejects exclusions that do not resolve to covered cards', async () => {
    const course = await createCourse('Assessment exclusions');
    const first = await createLesson(course.id, 'First');
    const second = await createLesson(course.id, 'Second');
    const uncovered = await createLessonCard(course.id, second.id, 'front_back', 'q', 'a');

    await expect(
      createCourseAssessment(course.id, 'Invalid exclusion', Date.now(), {
        afterLessonId: first.id,
        excludedCardIds: [uncovered.id],
      }),
    ).rejects.toThrow('is not covered by the assessment');
  });

  it('preserves exactly one final assessment', async () => {
    const course = await createCourse('Assessments test');
    const final = (await db.courseAssessments.where('courseId').equals(course.id).toArray()).find(
      (assessment) => assessment.kind === 'final',
    )!;
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);

    await expect(
      createCourseAssessment(course.id, 'Second final', Date.now() + 172_800_000, {
        kind: 'final',
      }),
    ).rejects.toThrow('exactly one final assessment');
    await expect(updateCourseAssessment(final.id, { kind: 'checkpoint' })).rejects.toThrow(
      'cannot be demoted',
    );
    await expect(updateCourseAssessment(checkpoint.id, { kind: 'final' })).rejects.toThrow(
      'exactly one final assessment',
    );
    await expect(deleteCourseAssessment(final.id)).rejects.toThrow('cannot be deleted');

    const assessments = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(assessments.filter((assessment) => assessment.kind === 'final')).toEqual([final]);
    expect(assessments.filter((assessment) => assessment.kind === 'checkpoint')).toEqual([
      checkpoint,
    ]);
  });

  it('allows deleting a checkpoint without touching the final', async () => {
    const course = await createCourse('Assessments test');
    const checkpoint = await createCourseAssessment(course.id, 'Mock', Date.now() + 86_400_000);
    const plan = await createOrResumeRevisionPlan(checkpoint.id, 20, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });

    await deleteCourseAssessment(checkpoint.id);

    const remaining = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].kind).toBe('final');
    expect(await db.revisionPlans.get(plan.id)).toBeUndefined();
  });
});
