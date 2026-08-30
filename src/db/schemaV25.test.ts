import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, readAllDataFromVersion } from './schema';

describe('schema v25 agent memories through the current schema', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('adds the indexed memory store and includes it in migration snapshots', async () => {
    await db.open();
    expect(db.verno).toBe(26);
    expect(db.agentMemories.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(['courseId', 'status', 'updatedAt', 'tags']),
    );
    await db.agentMemories.add({
      id: 'memory-1',
      courseId: null,
      tags: ['preference'],
      status: 'active',
      content: 'Use concise examples.',
      references: [],
      basis: 'learner-stated',
      createdAt: 1,
      updatedAt: 1,
    });
    db.close();

    const snapshot = await readAllDataFromVersion('lacuna', 26);
    expect(snapshot.agentMemories).toEqual([expect.objectContaining({ id: 'memory-1' })]);
  });
});
