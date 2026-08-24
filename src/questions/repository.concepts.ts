import { clearTombstone, recordTombstone } from '../db/mutationStamp';
import { db, makeId } from '../db/schema';
import type { Concept } from './types';
import { cleanName } from './repository.shared';

export async function createConcept(
  courseId: string,
  name: string,
  options: { id?: string; now?: number; provisional?: boolean } = {},
): Promise<Concept> {
  const now = options.now ?? Date.now();
  const concept: Concept = {
    id: options.id ?? makeId(),
    scope: 'course',
    scopeKey: `course:${courseId}`,
    courseId,
    name: cleanName(name, 'Untitled concept'),
    provisional: options.provisional ?? false,
    createdAt: now,
    updatedAt: now,
  };
  return db.transaction('rw', [db.courses, db.concepts, db.tombstones], async (tx) => {
    if (!(await db.courses.get(courseId))) throw new Error('Course not found.');
    await db.concepts.add(concept);
    await clearTombstone(tx, 'concepts', concept.id);
    return concept;
  });
}

export async function listConcepts(courseId: string): Promise<Concept[]> {
  return (await db.concepts.where('courseId').equals(courseId).toArray()).sort(
    (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
}

export async function updateConcept(
  conceptId: string,
  changes: { name?: string; provisional?: boolean },
  now = Date.now(),
): Promise<Concept> {
  return db.transaction('rw', db.concepts, async () => {
    const concept = await db.concepts.get(conceptId);
    if (!concept) throw new Error('Concept not found.');
    if (concept.scope === 'legacy-scheduling-unit' && changes.provisional === false) {
      throw new Error('A legacy scheduling-unit Concept must remain provisional.');
    }
    const updated: Concept = {
      ...concept,
      ...(changes.name === undefined ? {} : { name: cleanName(changes.name, 'Untitled concept') }),
      ...(changes.provisional === undefined ? {} : { provisional: changes.provisional }),
      updatedAt: now,
    } as Concept;
    await db.concepts.put(updated);
    return updated;
  });
}

export async function deleteConcept(conceptId: string, now = Date.now()): Promise<void> {
  await db.transaction(
    'rw',
    [db.concepts, db.cards, db.questionConcepts, db.tombstones],
    async (tx) => {
      const concept = await db.concepts.get(conceptId);
      if (!concept) return;
      const [cardReference, questionReference] = await Promise.all([
        db.cards.where('conceptId').equals(conceptId).first(),
        db.questionConcepts
          .filter(
            (set) =>
              set.targetConceptIds.includes(conceptId) ||
              set.prerequisiteConceptIds.includes(conceptId),
          )
          .first(),
      ]);
      if (cardReference || questionReference) {
        throw new Error('The Concept is still referenced by a Card or Question.');
      }
      await db.concepts.delete(conceptId);
      await recordTombstone(tx, 'concepts', conceptId, now);
    },
  );
}
