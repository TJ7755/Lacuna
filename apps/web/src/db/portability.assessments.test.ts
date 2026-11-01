import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, BACKUP_VERSION } from './portability';
import {
  createCourse,
  createLesson,
  createCourseAssessment,
  createLessonCard,
  upsertLessonCardExposure,
} from './repository';
import { createOrResumeRevisionPlan, startRevisionWindow } from './revisionPlanRepository';

import { reset } from './portability.testFixtures';

describe('backup assessments', () => {
  beforeEach(reset);

  it('exports full assessment semantics and stable ids in version 9', async () => {
    const course = await createCourse('Chemistry', { examDate: 1_900_000_000_000 });
    const lesson = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
    await createCourseAssessment(course.id, 'Paper 1', 1_800_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
      excludedCardIds: [card.id],
    });

    const backup = await exportDatabase();

    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.courses?.[0]).not.toHaveProperty('examDate');
    expect(backup.courseAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Paper 1',
          afterLessonId: lesson.id,
          coverageMode: 'custom',
          lessonIds: [lesson.id],
          excludedCardIds: [card.id],
        }),
      ]),
    );
    expect(backup.courseExamDates).toBeUndefined();
  });

  it('preserves steady retention through backup replacement', async () => {
    const course = await createCourse('Spanish', { schedulingMode: 'steady' });
    const backup = await exportDatabase();

    await importBackup(backup, 'replace');

    const [finalAssessment] = await db.courseAssessments
      .where('courseId')
      .equals(course.id)
      .toArray();
    expect(finalAssessment).toMatchObject({ schedulingMode: 'steady' });
    expect(finalAssessment).not.toHaveProperty('examDate');
    expect(await db.schedulingUnits.get(course.id)).not.toHaveProperty('examDate');
  });

  it('preserves final and checkpoint identities through replace restore', async () => {
    const course = await createCourse('Chemistry');
    const lesson = await createLesson(course.id, 'Bonding');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    const checkpoint = await createCourseAssessment(course.id, 'Paper 1', 1_900_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
      excludedCardIds: [card.id],
      needsAuthorConfirmation: true,
    });
    const before = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    const backup = await exportDatabase();

    await importBackup(backup, 'replace');

    const after = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after.find((assessment) => assessment.id === checkpoint.id)).toEqual(checkpoint);
  });

  it('round-trips complete revision-plan state through replace restore', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const lesson = await createLesson(course.id, 'Cells');
    const card = await createLessonCard(course.id, lesson.id, 'front_back', 'Q', 'A');
    await upsertLessonCardExposure(lesson.id, card.id, now - 1);
    const assessment = await createCourseAssessment(
      course.id,
      'Paper 1',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC', afterLessonId: lesson.id },
    );
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      25,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'unsupported',
      },
      now,
    );
    const backup = await exportDatabase();

    await db.revisionPlans.clear();
    await importBackup(backup, 'replace');
    expect(await db.revisionPlans.get(plan.id)).toEqual(plan);
    expect(backup.revisionPlans?.[0]).toEqual(
      expect.objectContaining({
        assessmentId: assessment.id,
        input: expect.objectContaining({
          coverageVersion: expect.stringMatching(/^v1-/),
          deadlineAt: assessment.examDate,
          timeZone: 'UTC',
          projection: expect.objectContaining({ memoryModelVersion: 'fsrs-6' }),
        }),
        windows: expect.any(Array),
        cardStates: [{ cardId: card.id, status: 'eligible' }],
      }),
    );
  });

  it('imports the explicit legacy courseExamDates boundary and preserves checkpoint ids', async () => {
    const course = await createCourse('Legacy course', { examDate: 1_900_000_000_000 });
    const lesson = await createLesson(course.id, 'Lesson 1');
    const checkpoint = await createCourseAssessment(course.id, 'Mid-term', 1_800_000_000_000, {
      afterLessonId: lesson.id,
      coverageMode: 'custom',
      lessonIds: [lesson.id],
    });
    const current = await exportDatabase();
    const legacy = {
      ...current,
      app: 'lacuna' as const,
      version: 6,
      courses: current.courses?.map((record) => ({
        ...record,
        examDate: 1_900_000_000_000,
        timeZone: 'UTC',
      })),
      courseExamDates: [
        {
          id: checkpoint.id,
          courseId: course.id,
          name: checkpoint.name,
          examDate: checkpoint.examDate!,
          lessonIds: [lesson.id],
          createdAt: checkpoint.createdAt,
        },
      ],
      courseAssessments: undefined,
    };

    await importBackup(legacy, 'replace');

    const restored = await db.courseAssessments.where('courseId').equals(course.id).toArray();
    expect(restored.filter((assessment) => assessment.kind === 'final')).toHaveLength(1);
    expect(restored.find((assessment) => assessment.id === checkpoint.id)).toEqual(
      expect.objectContaining({ coverageMode: 'custom', lessonIds: [lesson.id] }),
    );
  });

  it('adds a missing checkpoint in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    await db.courseAssessments.delete(assessment.id);
    expect(await db.courseAssessments.count()).toBe(1);

    await importBackup(backup, 'merge');

    const assessments = await db.courseAssessments.toArray();
    expect(assessments).toHaveLength(2);
    expect(assessments.find((entry) => entry.kind === 'checkpoint')?.name).toBe('Paper 1');
  });

  it('resolves a checkpoint id collision by newer createdAt in merge mode', async () => {
    const course = await createCourse('Chemistry');
    const assessment = await createCourseAssessment(course.id, 'Paper 1', Date.now() + 86400000);
    const backup = await exportDatabase();

    // Local copy is edited after the backup was taken, so its createdAt is newer.
    await db.courseAssessments.update(assessment.id, {
      name: 'Paper 1 (Resit)',
      createdAt: assessment.createdAt + 1000,
    });
    await importBackup(backup, 'merge');

    const updated = await db.courseAssessments.get(assessment.id);
    expect(updated!.name).toBe('Paper 1 (Resit)'); // local wins because more recently created/edited
  });

  it('clears plans when a legacy replace backup omits them', async () => {
    const course = await createCourse('Legacy');
    const assessment = await createCourseAssessment(course.id, 'Paper', Date.now() + 86_400_000);
    await createOrResumeRevisionPlan(assessment.id, 15, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const backup = await exportDatabase();
    delete backup.revisionPlans;

    await importBackup(backup, 'replace');
    expect(await db.revisionPlans.count()).toBe(0);
  });

  it('merges plans by assessment while preserving local identity, active work and history', async () => {
    const now = Date.parse('2026-07-17T08:00:00Z');
    const course = await createCourse('Biology');
    const assessment = await createCourseAssessment(
      course.id,
      'Paper',
      Date.parse('2026-07-19T12:00:00Z'),
      { timeZone: 'UTC' },
    );
    const plan = await createOrResumeRevisionPlan(
      assessment.id,
      15,
      {
        projectionMode: 'fsrs-6-practice-fallback',
        memoryModelVersion: 'fsrs-6',
        fallbackReason: 'missing',
      },
      now,
    );
    await startRevisionWindow(plan.id, plan.windows[0].id, now + 1);
    const backup = await exportDatabase();
    const incoming = {
      ...backup.revisionPlans![0],
      id: 'incoming-plan-id',
      updatedAt: now + 100,
      completedSessions: [
        {
          id: 'remote-session',
          windowId: 'remote-window',
          startedAt: now + 2,
          completedAt: now + 3,
          cardIds: [],
          reviewEventIds: [],
        },
      ],
    };
    const incomingBackup = { ...backup, revisionPlans: [incoming] };

    await importBackup(incomingBackup, 'merge');
    await importBackup(incomingBackup, 'merge');
    const merged = await db.revisionPlans.where('assessmentId').equals(assessment.id).first();
    expect(merged?.id).toBe(plan.id);
    expect(merged?.windows.find((window) => window.id === plan.windows[0].id)?.status).toBe(
      'active',
    );
    expect(merged?.completedSessions).toEqual([incoming.completedSessions[0]]);
    expect(await db.revisionPlans.where('assessmentId').equals(assessment.id).count()).toBe(1);
  });

  it('remaps a merged final-assessment plan to the retained local assessment id', async () => {
    const course = await createCourse('Biology');
    const final = (await db.courseAssessments.where('courseId').equals(course.id).toArray()).find(
      (assessment) => assessment.kind === 'final',
    )!;
    const plan = await createOrResumeRevisionPlan(final.id, 15, {
      projectionMode: 'fsrs-6-practice-fallback',
      memoryModelVersion: 'fsrs-6',
      fallbackReason: 'missing',
    });
    const backup = await exportDatabase();
    const remoteFinalId = 'remote-final-id';
    const incoming = {
      ...backup,
      courseAssessments: backup.courseAssessments?.map((assessment) =>
        assessment.id === final.id ? { ...assessment, id: remoteFinalId } : assessment,
      ),
      revisionPlans: backup.revisionPlans?.map((entry) =>
        entry.id === plan.id
          ? {
              ...entry,
              id: 'remote-plan-id',
              assessmentId: remoteFinalId,
              updatedAt: entry.updatedAt + 1,
            }
          : entry,
      ),
    };

    await importBackup(incoming, 'merge');
    const plans = await db.revisionPlans.where('courseId').equals(course.id).toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual(expect.objectContaining({ id: plan.id, assessmentId: final.id }));
  });
});
