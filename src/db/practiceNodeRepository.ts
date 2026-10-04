import { db, makeId } from './schema';
import { canEditLessons } from '../course/lessonViewMode';
import { friendlyDbError } from './dbErrors';
import type { PracticeMilestone, PracticeNode, QuestionSetPracticeNode } from './types';
import { stampUpdatedAt, recordTombstone } from './mutationStamp';
import { parseQuestionSetPracticeNode } from './questionSetPracticeNode';

export async function createPracticeNode(
  courseId: string,
  opts: Partial<PracticeNode> & Pick<PracticeNode, 'type' | 'name'>,
): Promise<PracticeNode> {
  try {
    if (
      opts.type === 'question-set' ||
      opts.questionSetId !== undefined ||
      opts.afterLessonId !== undefined
    ) {
      throw new Error('Question Set activities require the Question Set repository API.');
    }
    const now = Date.now();
    const node = stampUpdatedAt({
      id: makeId(),
      courseId,
      createdAt: now,
      ...opts,
    }, now);
    await db.practiceNodes.add(node);
    return node;
  } catch (error) {
    throw friendlyDbError(error);
  }
}

export async function updatePracticeNode(
  id: string,
  changes: Partial<PracticeNode>,
): Promise<void> {
  try {
    if (changes.type === 'question-set' || changes.questionSetId !== undefined || changes.afterLessonId !== undefined || (await db.practiceNodes.get(id))?.type === 'question-set') {
      throw new Error('Question Set activities require the Question Set repository API.');
    }
    await db.practiceNodes.update(id, stampUpdatedAt(changes));
  } catch (error) {
    throw friendlyDbError(error);
  }
}

async function requireQuestionSetActivityReferences(
  courseId: string,
  questionSetId: string,
  afterLessonId: string,
): Promise<void> {
  const [course, set, lesson] = await Promise.all([
    db.courses.get(courseId),
    db.questionSets.get(questionSetId),
    db.lessons.get(afterLessonId),
  ]);
  if (!course || course.archived || !canEditLessons(course)) {
    throw new Error('This Course is read-only.');
  }
  if (!set || set.courseId !== courseId) {
    throw new Error('The Question Set must belong to this Course.');
  }
  if (!lesson || lesson.courseId !== courseId) {
    throw new Error('The Lesson must belong to this Course.');
  }
}

export async function createQuestionSetPracticeNode(
  courseId: string,
  questionSetId: string,
  afterLessonId: string,
): Promise<QuestionSetPracticeNode> {
  return db.transaction('rw', [db.courses, db.questionSets, db.lessons, db.practiceNodes], async () => {
    await requireQuestionSetActivityReferences(courseId, questionSetId, afterLessonId);
    const now = Date.now();
    const node: QuestionSetPracticeNode = {
      id: makeId(), courseId, type: 'question-set', name: 'Practice Qs',
      questionSetId, afterLessonId, createdAt: now, updatedAt: now,
    };
    await db.practiceNodes.add(node);
    return node;
  });
}

export async function updateQuestionSetPracticeNode(
  id: string,
  afterLessonId: string,
): Promise<QuestionSetPracticeNode> {
  return db.transaction('rw', [db.courses, db.questionSets, db.lessons, db.practiceNodes], async () => {
    const existing = await db.practiceNodes.get(id);
    if (!existing || existing.type !== 'question-set' || !existing.questionSetId) {
      throw new Error('Question Set activity not found.');
    }
    await requireQuestionSetActivityReferences(existing.courseId, existing.questionSetId, afterLessonId);
    const node: QuestionSetPracticeNode = {
      ...parseQuestionSetPracticeNode(existing), afterLessonId,
      updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
    };
    await db.practiceNodes.put(node);
    return node;
  });
}

export async function deleteQuestionSetPracticeNode(id: string): Promise<void> {
  await db.transaction('rw', [db.courses, db.practiceNodes, db.practiceMilestones, db.tombstones], async (tx) => {
    const node = await db.practiceNodes.get(id);
    if (!node || node.type !== 'question-set') return;
    const course = await db.courses.get(node.courseId);
    if (!course || course.archived || !canEditLessons(course)) {
      throw new Error('This Course is read-only.');
    }
    await db.practiceNodes.delete(id);
    await recordTombstone(tx, 'practiceNodes', id, Math.max(Date.now(), node.updatedAt + 1));
    if (await db.practiceMilestones.get(id)) {
      await db.practiceMilestones.delete(id);
      await recordTombstone(tx, 'practiceMilestones', id);
    }
  });
}

export async function deletePracticeNode(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.practiceNodes, db.practiceMilestones, db.tombstones],
    async (tx) => {
      if ((await db.practiceNodes.get(id))?.type === 'question-set') {
        throw new Error('Question Set activities require the Question Set repository API.');
      }
      await recordTombstone(tx, 'practiceNodes', id);
      await recordTombstone(tx, 'practiceMilestones', id);
      await db.practiceMilestones.delete(id);
      await db.practiceNodes.delete(id);
    },
  );
}

/** Persist measured node progress, replacing progress from an obsolete effective scope. */
export async function savePracticeMilestoneProgress(
  nodeKey: string,
  courseId: string,
  scopeVersion: string,
  securedCardCount: number,
  totalCardCount: number,
  completed: boolean = false,
  now: number = Date.now(),
): Promise<PracticeMilestone> {
  if ((await db.practiceNodes.get(nodeKey))?.type === 'question-set') {
    throw new Error('Card practice milestones cannot measure a Question Set activity.');
  }
  const existing = await db.practiceMilestones.get(nodeKey);
  const sameScope = existing?.scopeVersion === scopeVersion;
  const milestone = stampUpdatedAt({
    nodeKey,
    courseId,
    scopeVersion,
    securedCardCount: Math.max(0, Math.min(securedCardCount, totalCardCount)),
    totalCardCount: Math.max(0, totalCardCount),
    ...(completed || (sameScope && existing.completedAt !== undefined)
      ? {
          completedAt:
            sameScope && existing?.completedAt !== undefined ? existing.completedAt : now,
        }
      : {}),
  }, now);
  await db.practiceMilestones.put(milestone);
  return milestone;
}
