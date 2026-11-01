import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { exportDatabase, importBackup, validateBackup } from './portability';
import type { AgentMemory } from '@lacuna/core/db/types';
import { createCourse } from './repository';
import { agentMemoryRepository } from './agentMemoryRepository';

import { reset } from './portability.testFixtures';

describe('backup memories', () => {
  beforeEach(reset);

  it('exports and replace-restores durable teaching memories', async () => {
    const course = await createCourse('Maths');
    const memory = await agentMemoryRepository.create({
      courseId: course.id,
      tags: ['preference'],
      content: 'Use concise worked examples.',
      basis: 'learner-stated',
    });
    const backup = await exportDatabase();
    expect(backup.agentMemories).toEqual([memory]);

    await db.agentMemories.clear();
    await importBackup(backup, 'replace');
    expect(await db.agentMemories.get(memory.id)).toEqual(memory);
  });

  it('rejects malformed memory collections and replace backups with orphaned scopes', async () => {
    const backup = await exportDatabase();
    expect(validateBackup({ ...backup, agentMemories: [{}] })).toBe(false);
    await expect(
      importBackup(
        {
          ...backup,
          agentMemories: [
            {
              id: 'memory-1',
              courseId: 'missing-course',
              tags: ['context'],
              status: 'active',
              content: 'Orphaned.',
              references: [],
              basis: 'learner-stated',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        'replace',
      ),
    ).rejects.toThrow('missing from the backup');
  });

  it('recovery merge takes newer memory evidence and a canonical equal-time tie', async () => {
    const local = await agentMemoryRepository.create(
      {
        courseId: null,
        tags: ['context'],
        content: 'alpha',
        basis: 'learner-stated',
      },
      10,
    );
    const backup = await exportDatabase();
    await importBackup(
      {
        ...backup,
        agentMemories: [{ ...local, content: 'omega' }],
        tombstones: [{ table: 'agentMemories', recordId: local.id, deletedAt: 20 }],
      },
      'merge',
    );

    expect(await db.agentMemories.get(local.id)).toMatchObject({ content: 'omega' });
    expect(await db.tombstones.get(['agentMemories', local.id])).toMatchObject({ deletedAt: 20 });
  });

  it('rejects a recovery merge that moves an existing memory to another scope', async () => {
    const local = await agentMemoryRepository.create(
      {
        courseId: null,
        tags: ['context'],
        content: 'Global context.',
        basis: 'learner-stated',
      },
      10,
    );
    const course = await createCourse('Scoped target');
    const backup = await exportDatabase();

    await expect(
      importBackup(
        {
          ...backup,
          agentMemories: [{ ...local, courseId: course.id, updatedAt: 20 }],
        },
        'merge',
      ),
    ).rejects.toThrow('cannot move between global and Course scope');
    expect(await db.agentMemories.get(local.id)).toMatchObject({ courseId: null });
  });

  it('selects the newest duplicate incoming memory before persistence', async () => {
    const local = await agentMemoryRepository.create(
      {
        courseId: null,
        tags: ['context'],
        content: 'Local context.',
        basis: 'learner-stated',
      },
      10,
    );
    const backup = await exportDatabase();

    await importBackup(
      {
        ...backup,
        agentMemories: [
          { ...local, content: 'Newest context.', updatedAt: 30 },
          { ...local, content: 'Older context.', updatedAt: 20 },
        ],
      },
      'merge',
    );

    expect(await db.agentMemories.get(local.id)).toMatchObject({
      content: 'Newest context.',
      updatedAt: 30,
    });
  });

  it('rejects conflicting scopes among duplicate incoming memories', async () => {
    const course = await createCourse('Scoped target');
    const backup = await exportDatabase();
    const incoming: AgentMemory = {
      id: 'memory-1',
      courseId: null,
      tags: ['context'],
      status: 'active',
      content: 'Global context.',
      references: [],
      basis: 'learner-stated',
      createdAt: 10,
      updatedAt: 20,
    };

    await expect(
      importBackup(
        {
          ...backup,
          agentMemories: [incoming, { ...incoming, courseId: course.id, updatedAt: 30 }],
        },
        'merge',
      ),
    ).rejects.toThrow('cannot move between global and Course scope');
  });
});
