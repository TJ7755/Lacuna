import { describe, expect, it } from 'vitest';
import { isAgentMemory } from './agentMemoryRecord';

const valid = {
  id: 'memory-1',
  courseId: null,
  tags: ['preference'] as const,
  status: 'active' as const,
  content: 'Use short examples.',
  references: [],
  basis: 'learner-stated' as const,
  createdAt: 1,
  updatedAt: 1,
};

describe('agentMemoryRecord', () => {
  it('accepts a bounded global memory', () => expect(isAgentMemory(valid)).toBe(true));

  it('rejects global entity references and sessions without expiry', () => {
    expect(
      isAgentMemory({
        ...valid,
        references: [{ kind: 'course', id: 'course-1', label: 'Maths' }],
      }),
    ).toBe(false);
    expect(isAgentMemory({ ...valid, tags: ['session'] })).toBe(false);
  });

  it('enforces the agreed content, reference and provenance limits', () => {
    expect(isAgentMemory({ ...valid, content: 'x'.repeat(8_001) })).toBe(false);
    expect(
      isAgentMemory({
        ...valid,
        courseId: 'course-1',
        references: Array.from({ length: 26 }, (_, index) => ({
          kind: 'course',
          id: `course-${index}`,
          label: 'Course',
        })),
      }),
    ).toBe(false);
    expect(isAgentMemory({ ...valid, provenance: { agentId: 'x'.repeat(161) } })).toBe(false);
  });

  it('rejects unknown fields, oversized ids and invalid timestamps', () => {
    expect(isAgentMemory({ ...valid, unexpected: true })).toBe(false);
    expect(isAgentMemory({ ...valid, id: 'x'.repeat(161) })).toBe(false);
    expect(isAgentMemory({ ...valid, createdAt: -1 })).toBe(false);
    expect(isAgentMemory({ ...valid, updatedAt: 1.5 })).toBe(false);
    expect(isAgentMemory({ ...valid, createdAt: 2, updatedAt: 1 })).toBe(false);
    expect(
      isAgentMemory({
        ...valid,
        courseId: 'course-1',
        references: [{ kind: 'course', id: 'course-1', label: 'Course', unexpected: true }],
      }),
    ).toBe(false);
  });
});
