import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { stampUpdatedAt } from '../db/mutationStamp';
import { canEditLessons } from '../course/lessonViewMode';
import { makeId } from '../utils/id';
import { parseQuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type { CourseRecord } from '@lacuna/core/db/types';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import {
  COURSE_TECHNIQUE_LIMIT,
  CUSTOM_TECHNIQUE_ID_PREFIX,
  courseTechniquesSchema,
  effectiveCourseTechniques,
  isBuiltInTechniqueId,
  SCIENCE_TECHNIQUES,
  suggestedTechniqueIds,
  techniqueNameKey,
  type CourseTechnique,
} from '@lacuna/core/questions/techniqueTags';
import { flattenQuestionSet } from './questionSetAuthoring';

/** Every identity a set's criteria mention, including Jev's unconfirmed suggestions. */
export function referencedTechniqueIds(sets: readonly QuestionSet[]): Set<string> {
  const ids = new Set<string>();
  for (const set of sets)
    for (const row of flattenQuestionSet(set))
      for (const allocation of row.node.answer?.allocations ?? []) {
        for (const id of allocation.techniqueTags?.techniqueIds ?? []) ids.add(id);
        for (const id of suggestedTechniqueIds(allocation.techniqueTags)) ids.add(id);
      }
  return ids;
}

export function courseTechniqueCatalogue(
  course: Pick<CourseRecord, 'techniques'> | undefined,
  sets: readonly QuestionSet[],
): CourseTechnique[] {
  return effectiveCourseTechniques(course?.techniques, referencedTechniqueIds(sets));
}

export function activeTechniques(catalogue: readonly CourseTechnique[]): CourseTechnique[] {
  return catalogue.filter((technique) => !technique.archived);
}

export function archivedTechniqueIds(
  course: Pick<CourseRecord, 'techniques'> | undefined,
): Set<string> {
  return new Set(course?.techniques?.filter((row) => row.archived).map((row) => row.id));
}

/** Live effective catalogue, including archived entries so old tags keep their names. */
export function useCourseTechniques(courseId: string | undefined): CourseTechnique[] | undefined {
  return useLiveQuery(async () => {
    if (!courseId) return [];
    const [course, sets] = await Promise.all([
      db.courses.get(courseId),
      db.questionSets.where('courseId').equals(courseId).toArray(),
    ]);
    return courseTechniqueCatalogue(course, sets.map(parseQuestionSetRecord));
  }, [courseId]);
}

export class CourseTechniqueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseTechniqueError';
  }
}

export interface CourseTechniqueInput {
  name: string;
  description?: string;
  example?: string;
}

function cleanInput(input: CourseTechniqueInput) {
  const name = input.name.trim();
  if (!name) throw new CourseTechniqueError('Give the technique a name.');
  const description = input.description?.trim();
  const example = input.example?.trim();
  return {
    name,
    ...(description ? { description } : {}),
    ...(example ? { example } : {}),
  };
}

/** Read, change and validate the catalogue atomically, so concurrent edits cannot be lost. */
async function mutateCatalogue<T>(
  courseId: string,
  change: (catalogue: CourseTechnique[]) => { catalogue: CourseTechnique[]; result: T },
): Promise<T> {
  return db.transaction('rw', [db.courses, db.questionSets], async () => {
    const course = await db.courses.get(courseId);
    if (!course) throw new CourseTechniqueError('The course could not be found.');
    if (course.archived || !canEditLessons(course))
      throw new CourseTechniqueError('This course is locked, so its techniques cannot change.');
    const sets = (await db.questionSets.where('courseId').equals(courseId).toArray()).map(
      parseQuestionSetRecord,
    );
    const { catalogue, result } = change(courseTechniqueCatalogue(course, sets));
    const active = catalogue.filter((row) => !row.archived);
    const names = active.map((row) => techniqueNameKey(row.name));
    const duplicate = active.find((_row, index) => names.indexOf(names[index]) !== index);
    if (duplicate)
      throw new CourseTechniqueError(`A technique called “${duplicate.name}” already exists.`);
    if (catalogue.length > COURSE_TECHNIQUE_LIMIT)
      throw new CourseTechniqueError(
        `A course can hold up to ${COURSE_TECHNIQUE_LIMIT} techniques.`,
      );
    await db.courses.update(
      courseId,
      stampUpdatedAt({ techniques: courseTechniquesSchema.parse(catalogue) }),
    );
    return result;
  });
}

export function createCourseTechnique(
  courseId: string,
  input: CourseTechniqueInput,
): Promise<CourseTechnique> {
  return mutateCatalogue(courseId, (catalogue) => {
    const technique: CourseTechnique = {
      id: `${CUSTOM_TECHNIQUE_ID_PREFIX}${makeId().toLowerCase()}`,
      ...cleanInput(input),
    };
    return { catalogue: [...catalogue, technique], result: technique };
  });
}

export function updateCourseTechnique(
  courseId: string,
  id: string,
  input: CourseTechniqueInput,
): Promise<void> {
  return mutateCatalogue(courseId, (catalogue) => {
    if (!catalogue.some((row) => row.id === id))
      throw new CourseTechniqueError('That technique no longer exists.');
    return {
      catalogue: catalogue.map((row) =>
        row.id === id
          ? { id, ...cleanInput(input), ...(row.archived ? { archived: true } : {}) }
          : row,
      ),
      result: undefined,
    };
  });
}

export function setCourseTechniqueArchived(
  courseId: string,
  id: string,
  archived: boolean,
): Promise<void> {
  return mutateCatalogue(courseId, (catalogue) => {
    if (!catalogue.some((row) => row.id === id))
      throw new CourseTechniqueError('That technique no longer exists.');
    return {
      catalogue: catalogue.map((row) => {
        if (row.id !== id) return row;
        const { archived: _archived, ...rest } = row;
        return archived ? { ...rest, archived: true } : rest;
      }),
      result: undefined,
    };
  });
}

/** Enable built-in techniques, restoring an archived copy rather than duplicating it. */
export function addBuiltInTechniques(courseId: string, ids: readonly string[]): Promise<void> {
  return mutateCatalogue(courseId, (catalogue) => {
    let next = catalogue;
    for (const id of ids) {
      if (!isBuiltInTechniqueId(id)) throw new CourseTechniqueError('Unknown built-in technique.');
      const existing = next.find((row) => row.id === id);
      if (existing) {
        if (existing.archived)
          next = next.map((row) => {
            if (row.id !== id) return row;
            const { archived: _archived, ...rest } = row;
            return rest;
          });
        continue;
      }
      const builtIn = SCIENCE_TECHNIQUES.find((row) => row.id === id)!;
      next = [
        ...next,
        {
          id: builtIn.id,
          name: builtIn.name,
          description: builtIn.description,
          ...('example' in builtIn ? { example: builtIn.example } : {}),
        },
      ];
    }
    return { catalogue: next, result: undefined };
  });
}
