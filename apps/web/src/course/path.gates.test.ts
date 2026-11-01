import { describe, it, expect } from 'vitest';
import {
  buildPath,
  practiceGateAfterLesson,
  manualPracticeGateKeysAfterLesson,
  manualPracticeGateOutcomeAfterLesson,
} from './path';
import { makeCourse, makeLesson, makePracticeNode } from './path.testFixtures';

describe('practiceGateAfterLesson', () => {
  const lessons = [
    makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 }),
    makeLesson({ id: 'l2', courseId: 'c1', orderIndex: 1 }),
    makeLesson({ id: 'l3', courseId: 'c1', orderIndex: 2 }),
  ];

  it('returns false when no manual practice node exists', () => {
    expect(practiceGateAfterLesson(lessons, [], 'l1')).toBe(false);
  });

  it('returns true when a manual node is placed immediately after the lesson', () => {
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    expect(practiceGateAfterLesson(lessons, [manual], 'l2')).toBe(true);
    // Not gating the other lessons.
    expect(practiceGateAfterLesson(lessons, [manual], 'l1')).toBe(false);
    expect(practiceGateAfterLesson(lessons, [manual], 'l3')).toBe(false);
  });

  it('ignores auto practice nodes — only manual nodes gate the ratchet', () => {
    const auto = makePracticeNode({ id: 'pn-auto', courseId: 'c1', type: 'auto', position: 1 });
    expect(practiceGateAfterLesson(lessons, [auto], 'l2')).toBe(false);
  });

  it('returns false for an unknown lesson id', () => {
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    expect(practiceGateAfterLesson(lessons, [manual], 'not-a-lesson')).toBe(false);
  });

  it.each([undefined, -1])(
    'keeps a manual node before every lesson from gating progression (position %s)',
    (position) => {
      const manual = makePracticeNode({ id: 'before', courseId: 'c1', type: 'manual', position });
      const nodes = buildPath(makeCourse({ id: 'c1' }), lessons, [], new Map(), [manual]);

      expect(nodes[0]).toMatchObject({ id: manual.id, afterLessonId: null });
      for (const lesson of lessons) {
        expect(manualPracticeGateKeysAfterLesson(lessons, [manual], lesson.id)).toEqual([]);
        expect(practiceGateAfterLesson(lessons, [manual], lesson.id)).toBe(false);
      }
    },
  );

  it('does not let one completed node satisfy another manual gate', () => {
    const first = makePracticeNode({
      id: 'first',
      courseId: 'c1',
      type: 'manual',
      position: 0,
    });
    const second = makePracticeNode({
      id: 'second',
      courseId: 'c1',
      type: 'manual',
      position: 1,
    });
    const active = new Set(['first', 'second']);

    expect(manualPracticeGateKeysAfterLesson(lessons, [first, second], 'l2')).toEqual(['second']);
    expect(
      manualPracticeGateOutcomeAfterLesson(
        lessons,
        [first, second],
        'l2',
        active,
        new Set(['first']),
      ),
    ).toBe(false);
    expect(
      manualPracticeGateOutcomeAfterLesson(
        lessons,
        [first, second],
        'l1',
        active,
        new Set(['first']),
      ),
    ).toBe(true);
  });

  it('requires every active manual gate in one slot to be completed', () => {
    const first = makePracticeNode({ id: 'first', courseId: 'c1', type: 'manual', position: 1 });
    const second = makePracticeNode({ id: 'second', courseId: 'c1', type: 'manual', position: 1 });
    const active = new Set(['first', 'second']);

    expect(
      manualPracticeGateOutcomeAfterLesson(
        lessons,
        [first, second],
        'l2',
        active,
        new Set(['first']),
      ),
    ).toBe(false);
    expect(
      manualPracticeGateOutcomeAfterLesson(
        lessons,
        [first, second],
        'l2',
        active,
        new Set(['first', 'second']),
      ),
    ).toBe(true);
  });

  it('treats latent manual nodes as non-gating', () => {
    const manual = makePracticeNode({ id: 'pn1', courseId: 'c1', type: 'manual', position: 1 });
    expect(practiceGateAfterLesson(lessons, [manual], 'l2', new Set())).toBe(false);
    expect(
      manualPracticeGateOutcomeAfterLesson(lessons, [manual], 'l2', new Set(), new Set()),
    ).toBeUndefined();
  });
});
