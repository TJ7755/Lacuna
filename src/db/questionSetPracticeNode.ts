import { z } from 'zod';
import type {
  CourseRecord,
  Lesson,
  LineageIdMapping,
  PracticeMilestone,
  PracticeNode,
  QuestionSetPracticeNode,
} from './types';
import type { QuestionSetRecord } from '../questions/questionSetCodec';

const selection = z.array(z.string().min(1)).min(1).refine(
  (ids) => new Set(ids).size === ids.length,
  'Question Set selection must contain unique identities.',
);

/** The only boundary that accepts the retired singular activity reference. */
function normaliseSelection(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { questionSetId, ...rest } = value as Record<string, unknown>;
  if (questionSetId === undefined) return rest;
  const legacy = z.string().min(1).parse(questionSetId);
  if (rest.questionSetIds !== undefined &&
      JSON.stringify(rest.questionSetIds) !== JSON.stringify([legacy])) {
    throw new Error('Conflicting singular and plural Question Set selection.');
  }
  return { ...rest, questionSetIds: rest.questionSetIds ?? [legacy] };
}

const snapshotSchema = z.object({
  questionSetIds: selection,
  afterLessonId: z.string().min(1),
  name: z.string().min(1),
}).strict();

export function parseQuestionSetPracticeNodeSnapshot(value: unknown) {
  return snapshotSchema.parse(normaliseSelection(value));
}

export function normalisePracticeNodeLineage(mapping: LineageIdMapping): LineageIdMapping {
  if (!mapping.questionSetPracticeNodeSnapshots) return mapping;
  return {
    ...mapping,
    questionSetPracticeNodeSnapshots: Object.fromEntries(
      Object.entries(mapping.questionSetPracticeNodeSnapshots).map(([id, snapshot]) =>
        [id, parseQuestionSetPracticeNodeSnapshot(snapshot)]),
    ),
  };
}

const schema = z
  .object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    type: z.literal('question-set'),
    name: z.string().min(1),
    questionSetIds: selection,
    afterLessonId: z.string().min(1),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
  })
  .strict();

export function parseQuestionSetPracticeNode(value: unknown): QuestionSetPracticeNode {
  return schema.parse(normaliseSelection(value));
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
    if (node.questionSetIds.some((id) => setById.get(id)?.courseId !== node.courseId)) {
      throw new Error('A Question Set activity references a missing Question Set.');
    }
    if (milestoneKeys.has(node.id)) {
      throw new Error('A Question Set activity cannot have a Card practice milestone.');
    }
  }
}
