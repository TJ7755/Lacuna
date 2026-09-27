import { z } from 'zod';
import type {
  CourseRecord,
  Lesson,
  PracticeMilestone,
  PracticeNode,
  QuestionSetPracticeNode,
} from './types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';

const schema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    type: z.literal('question-set'),
    name: z.string().min(1),
    questionSetId: z.string().min(1),
    afterLessonId: z.string().min(1),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  })
  .strict();

export function parseQuestionSetPracticeNode(value: unknown): QuestionSetPracticeNode {
  return schema.parse(value);
}

export function assertQuestionSetPracticeNodeReferences(
  nodes: readonly PracticeNode[],
  courses: readonly Pick<CourseRecord, 'id'>[],
  lessons: readonly Pick<Lesson, 'id' | 'courseId'>[],
  sets: readonly Pick<QuestionSetRecord, 'id' | 'courseId'>[],
  milestones: readonly Pick<PracticeMilestone, 'nodeKey'>[] = [],
): void {
  const courseIds = new Set(courses.map((course) => course.id));
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const setById = new Map(sets.map((set) => [set.id, set]));
  const milestoneKeys = new Set(milestones.map((milestone) => milestone.nodeKey));
  for (const raw of nodes) {
    if (raw.type !== 'question-set') continue;
    const node = parseQuestionSetPracticeNode(raw);
    if (!courseIds.has(node.courseId))
      throw new Error('A Question Set activity references a missing Course.');
    if (lessonById.get(node.afterLessonId)?.courseId !== node.courseId) {
      throw new Error('A Question Set activity references a missing Lesson.');
    }
    if (setById.get(node.questionSetId)?.courseId !== node.courseId) {
      throw new Error('A Question Set activity references a missing Question Set.');
    }
    if (milestoneKeys.has(node.id)) {
      throw new Error('A Question Set activity cannot have a Card practice milestone.');
    }
  }
}
