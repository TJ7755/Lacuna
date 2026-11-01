import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCourse, setCourseSpecificationReference } from '../db/courseRepository';
import { db } from '../db/schema';
import * as concepts from './repository';
import type { Concept } from '@lacuna/core/questions/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Concept specification links', () => {
  it('replaces and clears links, stamps the Concept and queries only its Course', async () => {
    const course = await createCourse('Biology');
    const target = await concepts.createConcept(course.id, 'Enzyme activity', { now: 1 });
    const otherCourse = await createCourse('Another course');
    const foreign = await concepts.createConcept(otherCourse.id, 'Foreign concept', { now: 1 });
    const ids = ['unbundled-specification:point.1', 'other-specification:point-2'];
    const updated = await concepts.setConceptSpecificationPoints(target.id, ids, 10);
    await concepts.setConceptSpecificationPoints(foreign.id, ids, 11);
    expect(updated).toEqual({ ...target, specificationPointIds: ids, updatedAt: 10 });
    expect(await db.concepts.get(target.id)).toEqual(updated);
    expect(await concepts.getConceptsForSpecificationPoint(course.id, ids[0])).toEqual([updated]);
    await setCourseSpecificationReference(course.id, { specificationId: 'new-selection' });
    expect((await db.concepts.get(target.id))?.specificationPointIds).toEqual(ids);
    await concepts.setConceptSpecificationPoints(target.id, ['other-specification:point-3'], 12);
    expect(await concepts.getConceptsForSpecificationPoint(course.id, ids[0])).toEqual([]);
    const cleared = await concepts.setConceptSpecificationPoints(target.id, [], 13);
    expect(cleared.specificationPointIds).toEqual([]);
    expect(cleared.updatedAt).toBe(13);
  });

  it.each([
    ['unqualified'],
    ['bad id:point'],
    ['board:UPPER'],
    ['board:point:extra'],
    ['board:point', 'board:point'],
  ])('rejects malformed or duplicate links without mutation: %j', async (...ids) => {
    const course = await createCourse('Biology');
    const concept = await concepts.createConcept(course.id, 'Enzymes', { now: 1 });
    await expect(concepts.setConceptSpecificationPoints(concept.id, ids, 10)).rejects.toThrow();
    expect(await db.concepts.get(concept.id)).toEqual(concept);
  });

  it('rejects sparse links before persistence or JSON conversion can change their meaning', async () => {
    const course = await createCourse('Biology');
    const concept = await concepts.createConcept(course.id, 'Enzymes', { now: 1 });
    const sparse = new Array<string>(1);
    expect(JSON.stringify(sparse)).toBe('[null]');
    await expect(concepts.setConceptSpecificationPoints(concept.id, sparse, 10)).rejects.toThrow();
    expect(await db.concepts.get(concept.id)).toEqual(concept);
  });

  it('rejects missing, legacy and locked Concepts before mutation', async () => {
    await expect(concepts.setConceptSpecificationPoints('missing', [], 10)).rejects.toThrow(
      /not.*found/i,
    );
    const legacy: Concept = {
      id: 'legacy',
      scope: 'legacy-scheduling-unit',
      scopeKey: 'legacy-scheduling-unit:old',
      courseId: null,
      legacySchedulingUnitId: 'old',
      name: 'Legacy',
      provisional: true,
      createdAt: 1,
      updatedAt: 1,
    };
    await db.concepts.add(legacy);
    await expect(
      concepts.setConceptSpecificationPoints(legacy.id, ['board:point'], 10),
    ).rejects.toThrow(/legacy/i);
    expect(await db.concepts.get(legacy.id)).toEqual(legacy);
    const course = await createCourse('Biology');
    const concept = await concepts.createConcept(course.id, 'Enzymes', { now: 1 });
    await db.courses.update(course.id, {
      distributedCopy: {
        lineageId: 'teacher',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    });
    await expect(
      concepts.setConceptSpecificationPoints(concept.id, ['board:point'], 10),
    ).rejects.toThrow(/locked/i);
    expect(await db.concepts.get(concept.id)).toEqual(concept);
  });
});
