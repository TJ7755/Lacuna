import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, ensurePreMigrationSnapshot } from './schema';

describe('schema v30 specification links', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('adds the point index without rewriting v29 Course, Concept or attempt data', async () => {
    const course = {
      id: 'course-1',
      createdAt: 1,
      updatedAt: 2,
      examBoard: 'Custom board',
      specification: 'Custom specification',
    };
    const concepts = [
      {
        id: 'concept-1',
        scope: 'course',
        courseId: course.id,
        scopeKey: 'course:course-1',
        name: 'Existing concept',
        provisional: false,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'legacy-concept',
        scope: 'legacy-scheduling-unit',
        courseId: null,
        legacySchedulingUnitId: 'unit-1',
        scopeKey: 'legacy-scheduling-unit:unit-1',
        name: 'Legacy concept',
        provisional: true,
        createdAt: 1,
        updatedAt: 2,
      },
    ];
    const attempt = { id: 'attempt-1', courseId: course.id, marker: 'learner evidence' };
    const legacy = new Dexie('lacuna');
    legacy.version(29).stores({
      courses: 'id, createdAt',
      concepts: 'id, scopeKey, courseId, updatedAt',
      questionSetAttempts: 'id, courseId, questionSetId, status, updatedAt',
    });
    await legacy.open();
    await legacy.table('courses').add(course);
    await legacy.table('concepts').bulkAdd(concepts);
    await legacy.table('questionSetAttempts').add(attempt);
    legacy.close();

    await db.open();

    expect(db.verno).toBe(30);
    expect(await db.courses.get(course.id)).toEqual(course);
    expect(await db.concepts.bulkGet(concepts.map((concept) => concept.id))).toEqual(concepts);
    expect(await db.questionSetAttempts.get(attempt.id)).toEqual(attempt);
    const pointIndex = db.concepts.schema.indexes.find(
      (index) => index.name === 'specificationPointIds',
    );
    expect(pointIndex?.multi).toBe(true);
    await db.concepts.update('concept-1', {
      specificationPointIds: ['example-board-fixture:point.1', 'another-specification:point-2'],
    });
    expect(
      await db.concepts
        .where('specificationPointIds')
        .equals('example-board-fixture:point.1')
        .primaryKeys(),
    ).toEqual(['concept-1']);
  });

  it('uses v30 as the default snapshot target for a v29 database', async () => {
    const name = `lacuna-v30-snapshot-${Date.now()}`;
    const legacy = new Dexie(name);
    legacy.version(29).stores({ courses: 'id, createdAt' });
    await legacy.open();
    const course = { id: 'course-1', name: 'Keep this', createdAt: 1 };
    await legacy.table('courses').add(course);
    legacy.close();
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    try {
      await ensurePreMigrationSnapshot(name, undefined, saveSnapshot);
      expect(saveSnapshot).toHaveBeenCalledExactlyOnceWith(
        30,
        expect.objectContaining({ courses: [course] }),
      );
    } finally {
      await new Dexie(name).delete();
    }
  });
});
