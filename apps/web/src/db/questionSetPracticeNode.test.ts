import { describe, expect, it } from 'vitest';
import {
  assertQuestionSetPracticeNodeReferences,
  parseQuestionSetPracticeNode,
} from './questionSetPracticeNode';

const node = {
  id: 'activity-1',
  courseId: 'course-1',
  type: 'question-set' as const,
  name: 'Practice Qs',
  questionSetId: 'set-1',
  afterLessonId: 'lesson-1',
  createdAt: 1,
  updatedAt: 1,
};

describe('Question Set path activity codec', () => {
  it('rejects Card options and incomplete activities', () => {
    const { questionSetId, ...rest } = node;
    expect(parseQuestionSetPracticeNode(node)).toEqual({
      ...rest,
      questionSetIds: [questionSetId],
    });
    expect(() => parseQuestionSetPracticeNode({ ...node, cardCount: 5 })).toThrow();
    expect(() => parseQuestionSetPracticeNode({ ...node, afterLessonId: undefined })).toThrow();
  });

  it('preserves three identities in order and rejects empty, duplicate or conflicting selections', () => {
    const { questionSetId: _legacy, ...rest } = node;
    const canonical = { ...rest, questionSetIds: ['c', 'a', 'b'] };
    expect(parseQuestionSetPracticeNode(canonical)).toEqual(canonical);
    for (const questionSetIds of [[], ['a', 'a'], ['a', '']]) {
      expect(() => parseQuestionSetPracticeNode({ ...rest, questionSetIds })).toThrow();
    }
    expect(() => parseQuestionSetPracticeNode({ ...node, questionSetIds: ['other'] })).toThrow();
  });

  it('requires same-Course lesson and set references', () => {
    const courses = [{ id: 'course-1' }];
    const lessons = [{ id: 'lesson-1', courseId: 'course-1' }];
    const sets = [{ id: 'set-1', courseId: 'course-1' }];
    expect(() =>
      assertQuestionSetPracticeNodeReferences(
        [parseQuestionSetPracticeNode(node)],
        courses,
        lessons,
        sets,
      ),
    ).not.toThrow();
    expect(() =>
      assertQuestionSetPracticeNodeReferences(
        [parseQuestionSetPracticeNode(node)],
        courses,
        [],
        sets,
      ),
    ).toThrow('Lesson');
    expect(() =>
      assertQuestionSetPracticeNodeReferences(
        [parseQuestionSetPracticeNode(node)],
        courses,
        lessons,
        [],
      ),
    ).toThrow('Question Set');
    expect(() =>
      assertQuestionSetPracticeNodeReferences(
        [parseQuestionSetPracticeNode(node)],
        courses,
        lessons,
        sets,
        [{ nodeKey: node.id }],
      ),
    ).toThrow('Card practice milestone');
  });
});
