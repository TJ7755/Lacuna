import { db } from '../../db/schema';
import { GLOBAL_SCOPE_KEY } from '../grants';
import type { McpScopeTarget, McpToolError } from './protocol';

type Resolution = { ok: true; targets: McpScopeTarget[] } | { ok: false; error: McpToolError };

export async function resolveToolScopes(input: unknown): Promise<Resolution> {
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const courseIds = new Set<string>();
  const hasExplicitCourseId = Object.prototype.hasOwnProperty.call(value, 'courseId');
  if (
    hasExplicitCourseId &&
    (typeof value.courseId !== 'string' || value.courseId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: { kind: 'validation', message: 'courseId must be a non-empty string.' },
    };
  }
  const explicitCourseId = hasExplicitCourseId ? (value.courseId as string) : undefined;

  const missing = (kind: string, id: string): Resolution => ({
    ok: false,
    error: { kind: 'not_found', message: `${kind} "${id}" was not found.` },
  });
  if (explicitCourseId) {
    if (!(await db.courses.get(explicitCourseId))) return missing('Course', explicitCourseId);
    courseIds.add(explicitCourseId);
  }
  const addOwnedCourse = (courseId: string): Resolution | undefined => {
    if (explicitCourseId && explicitCourseId !== courseId) {
      return {
        ok: false,
        error: {
          kind: 'conflict',
          message: `The supplied entity does not belong to course "${explicitCourseId}".`,
        },
      };
    }
    courseIds.add(courseId);
  };
  const addCardCourse = async (card: {
    id: string;
    schedulingUnitId?: string;
  }): Promise<Resolution | undefined> => {
    if (!card.schedulingUnitId) return missing('Card scheduling unit', card.id);
    const schedulingUnit = await db.schedulingUnits.get(card.schedulingUnitId);
    if (!schedulingUnit) return missing('Card scheduling unit', card.schedulingUnitId);
    if (!schedulingUnit.courseId) return missing('Card course', card.schedulingUnitId);
    return addOwnedCourse(schedulingUnit.courseId);
  };
  if (typeof value.cardId === 'string') {
    const card = await db.cards.get(value.cardId);
    if (!card) return missing('Card', value.cardId);
    const conflict = await addCardCourse(card);
    if (conflict) return conflict;
  }
  if (Array.isArray(value.ids)) {
    for (const id of value.ids) {
      if (typeof id !== 'string') continue;
      const card = await db.cards.get(id);
      if (!card) return missing('Card', id);
      const conflict = await addCardCourse(card);
      if (conflict) return conflict;
    }
  }
  if (typeof value.lessonId === 'string') {
    const lesson = await db.lessons.get(value.lessonId);
    if (!lesson) return missing('Lesson', value.lessonId);
    const conflict = addOwnedCourse(lesson.courseId);
    if (conflict) return conflict;
  }
  if (typeof value.noteId === 'string') {
    const note = await db.notes.get(value.noteId);
    if (!note) return missing('Note', value.noteId);
    const lesson = await db.lessons.get(note.lessonId);
    if (!lesson) return missing('Lesson', note.lessonId);
    const conflict = addOwnedCourse(lesson.courseId);
    if (conflict) return conflict;
  }
  if (typeof value.sequenceId === 'string') {
    const sequence = await db.sequences.get(value.sequenceId);
    if (!sequence) return missing('Sequence', value.sequenceId);
    const conflict = addOwnedCourse(sequence.courseId);
    if (conflict) return conflict;
  }
  if (typeof value.occlusionId === 'string') {
    const occlusion = await db.occlusions.get(value.occlusionId);
    if (!occlusion) return missing('Occlusion', value.occlusionId);
    const conflict = addOwnedCourse(occlusion.courseId);
    if (conflict) return conflict;
  }
  if (typeof value.assessmentId === 'string') {
    const assessment = await db.courseAssessments.get(value.assessmentId);
    if (!assessment) return missing('Course assessment', value.assessmentId);
    const conflict = addOwnedCourse(assessment.courseId);
    if (conflict) return conflict;
  }
  if (courseIds.size === 0) courseIds.add(GLOBAL_SCOPE_KEY);
  if (courseIds.size > 1) {
    return {
      ok: false,
      error: {
        kind: 'conflict',
        message: 'A single MCP tool call cannot target multiple courses.',
      },
    };
  }
  const targets = await Promise.all(
    [...courseIds].map(async (courseId) => ({
      courseId,
      label:
        courseId === GLOBAL_SCOPE_KEY ? 'All Lacuna data' : (await db.courses.get(courseId))?.name,
    })),
  );
  return { ok: true, targets };
}
