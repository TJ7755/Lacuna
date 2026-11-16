import { db } from '../db/schema';
import { canEditLessons } from '../course/lessonViewMode';
import { createGeneratedQuestion, updateGeneratedQuestion } from './repository.authoring';
import { QuestionSetRevisionConflictError } from './questionSetRepository';
import type { QuestionSetDraft } from './questionSetDraftMaintenance';

/** The retained source owns generation; the aggregate owns exam links and frozen attempts own themselves. */
export async function publishGeneratedQuestionSet(draft: QuestionSetDraft) {
  const { content, generated } = draft;
  const [existing, course] = await Promise.all([
    db.questionSets.get(content.id),
    db.courses.get(content.courseId),
  ]);
  if (!course || course.archived || !canEditLessons(course))
    throw new Error('This Course is read-only.');
  if (!content.title.trim()) throw new Error('Give this set a title.');
  const exams = await db.courseAssessments.bulkGet(content.assessmentIds);
  if (exams.some((exam) => !exam || exam.courseId !== content.courseId))
    throw new Error('Every linked Assessment must belong to the Question Set Course.');
  if (
    !existing &&
    !draft.baseContentRevisionId &&
    generated?.sourceRevisionId === null &&
    content.legacyQuestionId &&
    !content.bank
  ) {
    const source = await createGeneratedQuestion({
      id: content.legacyQuestionId,
      courseId: content.courseId,
      name: content.title,
      suspended: generated.suspended,
      primaryLessonId: content.lessonIds[0] ?? null,
      additionalLessonIds: content.lessonIds.slice(1),
      targetConceptId: generated.targetConceptId,
      prerequisiteConceptIds: generated.prerequisiteConceptIds,
      generatorKey: generated.generatorKey,
      generatorVersion: generated.generatorVersion,
      generatorConfig: generated.configuration,
    });
    if (source.migratedToSetId !== content.id)
      throw new Error('Generated source ownership mismatch.');
    const record = (await db.questionSets.get(content.id))!;
    const next = { ...record, assessmentIds: [...content.assessmentIds] };
    await db.questionSets.put(next);
    return next;
  }
  if (
    !existing ||
    existing.courseId !== content.courseId ||
    existing.legacyQuestionId !== content.legacyQuestionId ||
    !existing.legacyQuestionId ||
    existing.bank ||
    content.bank ||
    !generated
  )
    throw new Error('Generated source ownership mismatch.');
  const source = await db.questions.get(existing.legacyQuestionId);
  if (
    !source ||
    source.kind !== 'generated' ||
    source.courseId !== content.courseId ||
    source.migratedToSetId !== content.id ||
    source.generatorKey !== generated.generatorKey ||
    source.generatorVersion !== generated.generatorVersion
  )
    throw new Error('Generated source ownership mismatch.');
  if (
    existing.contentRevisionId !== draft.baseContentRevisionId ||
    source.authoringRevisionId !== generated.sourceRevisionId
  )
    throw new QuestionSetRevisionConflictError();
  const primaryLessonId = content.lessonIds.includes(source.primaryLessonId ?? '')
    ? source.primaryLessonId
    : (content.lessonIds[0] ?? null);
  await updateGeneratedQuestion(source.id, {
    name: content.title,
    suspended: generated.suspended,
    primaryLessonId,
    additionalLessonIds: content.lessonIds.filter((id) => id !== primaryLessonId),
    targetConceptId: generated.targetConceptId,
    prerequisiteConceptIds: generated.prerequisiteConceptIds,
    generatorConfig: generated.configuration,
  });
  const refreshed = (await db.questionSets.get(content.id))!;
  const record = { ...refreshed, assessmentIds: [...content.assessmentIds] };
  await db.questionSets.put(record);
  return record;
}
