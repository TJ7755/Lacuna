import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('raw historical database snapshots', () => {
  it('includes assessments and plans in raw pre-migration payloads', async () => {
    const dbName = `lacuna-revision-snapshot-${Date.now()}`;
    const raw = new Dexie(dbName);
    raw.version(17).stores({
      courseAssessments: 'id, courseId, kind, examDate, createdAt',
      revisionPlans: 'id, &assessmentId, courseId, status, updatedAt',
    });
    await raw.open();
    await raw.table('courseAssessments').add({
      id: 'assessment-1',
      courseId: 'course-1',
      name: 'Paper',
      kind: 'checkpoint',
      examDate: 2_000,
      afterLessonId: null,
      coverageMode: 'prefix',
      excludedCardIds: [],
      createdAt: 1,
    });
    await raw.table('revisionPlans').add({
      id: 'plan-1',
      assessmentId: 'assessment-1',
      courseId: 'course-1',
      status: 'active',
      updatedAt: 1,
    });
    raw.close();

    const { readAllDataFromVersion } = await import('./schema');
    const payload = await readAllDataFromVersion(dbName);
    expect(payload.courseAssessments?.map((assessment) => assessment.id)).toEqual(['assessment-1']);
    expect(payload.revisionPlans?.map((plan) => plan.id)).toEqual(['plan-1']);
    await Dexie.delete(dbName);
  });
});
