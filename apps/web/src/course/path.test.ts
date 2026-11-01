import { describe, it, expect } from 'vitest';
import { buildPath, KNOWN_NODE_TYPES, type PathNode } from './path';
import { makeCourse, makeLesson, makeExamDate } from './path.testFixtures';

describe('KNOWN_NODE_TYPES', () => {
  it('contains lesson, checkpoint and practice types', () => {
    expect(KNOWN_NODE_TYPES).toContain('lesson');
    expect(KNOWN_NODE_TYPES).toContain('checkpoint');
    expect(KNOWN_NODE_TYPES).toContain('practice-auto');
    expect(KNOWN_NODE_TYPES).toContain('practice-manual');
  });

  it('every built path node has a known node type', () => {
    const course = makeCourse({ id: 'c1', unlockMode: 'open' });
    const lessons = [makeLesson({ id: 'l1', courseId: 'c1', orderIndex: 0 })];
    const checkpoint = makeExamDate({ id: 'cp1', courseId: 'c1' });
    const nodes: PathNode[] = buildPath(course, lessons, [checkpoint], new Map());
    for (const node of nodes) {
      expect(KNOWN_NODE_TYPES).toContain(node.nodeType);
    }
  });
});
