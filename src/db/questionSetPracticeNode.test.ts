import { describe, expect, it } from 'vitest';
import {
  assertQuestionSetPracticeNodeReferences,
  parseQuestionSetPracticeNode,
} from './questionSetPracticeNode';
import type { PracticeNode } from './types';

const node: PracticeNode = {
  id: 'activity-1',
  courseId: 'course-1',
  type: 'question-set',
  name: 'Practice Qs',
  questionSetId: 'set-1',
  afterLessonId: 'lesson-1',
  createdAt: 1,
  updatedAt: 1,
};

describe('Question Set path activity codec', () => {
  it('rejects Card options and incomplete activities', () => {
    expect(parseQuestionSetPracticeNode(node)).toEqual(node);
    expect(() => parseQuestionSetPracticeNode({ ...node, cardCount: 5 })).toThrow();
    expect(() => parseQuestionSetPracticeNode({ ...node, afterLessonId: undefined })).toThrow();
  });

  it('requires same-Course lesson and set references', () => {
    const courses = [{ id: 'course-1' }];
    const lessons = [{ id: 'lesson-1', courseId: 'course-1' }];
    const sets = [{ id: 'set-1', courseId: 'course-1' }];
    expect(() =>
      assertQuestionSetPracticeNodeReferences([node], courses, lessons, sets),
    ).not.toThrow();
    expect(() => assertQuestionSetPracticeNodeReferences([node], courses, [], sets)).toThrow(
      'Lesson',
    );
    expect(() => assertQuestionSetPracticeNodeReferences([node], courses, lessons, [])).toThrow(
      'Question Set',
    );
    expect(() =>
      assertQuestionSetPracticeNodeReferences([node], courses, lessons, sets, [
        { nodeKey: node.id },
      ]),
    ).toThrow('Card practice milestone');
  });
});
