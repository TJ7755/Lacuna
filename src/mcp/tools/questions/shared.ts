import { z } from 'zod';
import * as read from '../../../db/read';
import {
  getQuestion as repoGetQuestion,
  listConcepts as repoListConcepts,
} from '../../../questions/repository';
import { McpToolException, type ToolResult } from '../../types';

export const courseIdSchema = z.string().trim().min(1).describe('The id of the Course.');
export const conceptIdSchema = z.string().trim().min(1).describe('The id of a Concept.');
export const questionIdSchema = z
  .string()
  .trim()
  .min(1)
  .describe('The id of a Question definition.');
export const authoredTextSchema = z.string().trim().min(1);

export function ok<T>(data: T): ToolResult<T> {
  return { data };
}

export function notFound(kind: string, id: string): never {
  throw new McpToolException({ kind: 'not_found', message: `${kind} "${id}" was not found.` });
}

export function validation(message: string): never {
  throw new McpToolException({ kind: 'validation', message });
}

export async function requireCourse(courseId: string): Promise<void> {
  if (!(await read.getCourse(courseId))) notFound('Course', courseId);
}

export async function requireLesson(courseId: string, lessonId: string): Promise<void> {
  const lesson = await read.getLesson(lessonId);
  if (!lesson || lesson.courseId !== courseId) notFound('Lesson', lessonId);
}

export async function requireQuestion(questionId: string) {
  const record = await repoGetQuestion(questionId);
  if (!record) notFound('Question', questionId);
  return record;
}

async function requireConcept(courseId: string, conceptId: string) {
  const concept = (await repoListConcepts(courseId)).find(
    (candidate) => candidate.id === conceptId,
  );
  if (!concept) notFound('Concept', conceptId);
  return concept;
}

export async function requireRelationships(
  courseId: string,
  primaryLessonId: string | null | undefined,
  additionalLessonIds: readonly string[] | undefined,
  targetConceptId: string,
  prerequisiteConceptIds: readonly string[] | undefined,
): Promise<void> {
  await requireCourse(courseId);
  if (primaryLessonId && additionalLessonIds?.includes(primaryLessonId)) {
    validation('The primary Lesson cannot also be an additional Lesson.');
  }
  if (new Set(additionalLessonIds ?? []).size !== (additionalLessonIds ?? []).length) {
    validation('Additional Lesson ids must be unique.');
  }
  if (prerequisiteConceptIds?.includes(targetConceptId)) {
    validation('The primary target Concept cannot also be a prerequisite.');
  }
  if (new Set(prerequisiteConceptIds ?? []).size !== (prerequisiteConceptIds ?? []).length) {
    validation('Prerequisite Concept ids must be unique.');
  }
  const lessonIds = [...(primaryLessonId ? [primaryLessonId] : []), ...(additionalLessonIds ?? [])];
  for (const lessonId of lessonIds) {
    await requireLesson(courseId, lessonId);
  }
  await requireConcept(courseId, targetConceptId);
  for (const conceptId of prerequisiteConceptIds ?? []) {
    await requireConcept(courseId, conceptId);
  }
}
