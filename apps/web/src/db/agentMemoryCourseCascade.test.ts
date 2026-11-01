import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentMemoryRepository } from './agentMemoryRepository';
import { createCourse, deleteCourse, restoreCourse, snapshotCourse } from './repository';
import { db } from './schema';

describe('Course memory cascade', () => {
  beforeEach(async () => {
    await Promise.all([db.agentMemories.clear(), db.tombstones.clear(), db.courses.clear()]);
  });
  afterEach(async () => {
    await Promise.all([db.agentMemories.clear(), db.tombstones.clear()]);
  });

  it('captures, tombstones and restores scoped memories newer than their deletion', async () => {
    const course = await createCourse('Maths');
    const memory = await agentMemoryRepository.create(
      {
        courseId: course.id,
        tags: ['strength'],
        content: 'Checks algebraic substitutions carefully.',
        basis: 'observed-performance',
      },
      10,
    );
    const snapshot = await snapshotCourse(course.id);
    expect(snapshot?.agentMemories).toEqual([memory]);

    await deleteCourse(course.id);
    const deletion = await db.tombstones.get(['agentMemories', memory.id]);
    expect(await db.agentMemories.get(memory.id)).toBeUndefined();
    expect(deletion).toBeDefined();

    await restoreCourse(snapshot!);
    const restored = await db.agentMemories.get(memory.id);
    expect(restored?.updatedAt).toBeGreaterThan(deletion!.deletedAt);
    expect(await db.tombstones.get(['agentMemories', memory.id])).toBeUndefined();
  });
});
