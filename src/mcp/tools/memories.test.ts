import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { agentMemoryRepository, type DeletedAgentMemory } from '../../db/agentMemoryRepository';
import { createCourse } from '../../db/repository';
import { db } from '../../db/schema';
import { TOOL_REGISTRY } from '../registry';
import { createMemory, deleteMemory, searchMemories, updateMemory } from './memories';

const context = { agentId: 'terminal-agent', grant: null };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('memory MCP tools', () => {
  it('registers the four additive memory tools without changing the companion surface', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'lacuna.search_memories',
        'lacuna.create_memory',
        'lacuna.update_memory',
        'lacuna.delete_memory',
      ]),
    );
  });

  it('requires an explicit global or Course scope for search and creation', () => {
    expect(searchMemories.inputSchema.safeParse({ query: 'algebra' }).success).toBe(false);
    expect(searchMemories.inputSchema.safeParse({ scope: { kind: 'all' } }).success).toBe(false);
    expect(createMemory.inputSchema.safeParse({ content: 'Needs a scope.' }).success).toBe(false);
  });

  it('creates and searches a Course memory with bounded evidence metadata', async () => {
    const course = await createCourse('Biology');
    const created = await createMemory.handler(
      {
        scope: { kind: 'course', courseId: course.id },
        tags: ['misconception'],
        status: 'uncertain',
        content: 'The learner currently predicts that larger cells diffuse faster.',
        references: [{ kind: 'course', id: course.id, label: 'Biology' }],
        basis: 'agent-inferred',
        provenance: { conversationId: 'conversation-1', messageId: 'message-1' },
      },
      context,
    );

    expect(created.data).toMatchObject({
      courseId: course.id,
      tags: ['misconception'],
      basis: 'agent-inferred',
      provenance: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        agentId: 'terminal-agent',
      },
    });
    await expect(
      searchMemories.handler(
        { scope: { kind: 'course', courseId: course.id }, query: 'diffuse', limit: 10 },
        context,
      ),
    ).resolves.toEqual({ data: [created.data] });
    await expect(
      searchMemories.handler({ scope: { kind: 'global' }, query: 'diffuse' }, context),
    ).resolves.toEqual({ data: [] });
  });

  it('keeps scope immutable when updating learner evidence', async () => {
    const memory = await agentMemoryRepository.create({
      courseId: null,
      tags: ['preference'],
      content: 'Prefer short examples.',
      basis: 'learner-stated',
    });

    expect(
      updateMemory.inputSchema.safeParse({
        memoryId: memory.id,
        courseId: 'course-2',
        content: 'Prefer worked examples.',
      }).success,
    ).toBe(false);
    const updated = await updateMemory.handler(
      { memoryId: memory.id, content: 'Prefer worked examples.', status: 'active' },
      context,
    );
    expect(updated.data).toMatchObject({
      id: memory.id,
      courseId: null,
      content: 'Prefer worked examples.',
    });
  });

  it('deletes with an exhaustive repository snapshot that can restore the memory', async () => {
    const memory = await agentMemoryRepository.create({
      courseId: null,
      tags: ['context'],
      content: 'The learner has an exam on Friday.',
      basis: 'learner-stated',
    });

    const deleted = await deleteMemory.handler({ memoryId: memory.id }, context);
    expect(deleted.data).toEqual({ id: memory.id });
    expect(deleted.undo).toMatchObject({
      kind: 'restoreAgentMemory',
      snapshot: { memory: { id: memory.id } },
    });
    expect(await agentMemoryRepository.get(memory.id)).toBeUndefined();

    if (deleted.undo?.kind !== 'restoreAgentMemory') throw new Error('Expected memory Undo.');
    await agentMemoryRepository.restore(deleted.undo.snapshot as DeletedAgentMemory);
    expect(await agentMemoryRepository.get(memory.id)).toMatchObject({ id: memory.id });
  });

  it('enforces the agreed content, reference, provenance, query and result bounds', () => {
    const base = {
      scope: { kind: 'global' as const },
      tags: ['context' as const],
      content: 'x',
      basis: 'learner-stated' as const,
    };
    expect(
      createMemory.inputSchema.safeParse({ ...base, content: 'x'.repeat(8_001) }).success,
    ).toBe(false);
    expect(
      createMemory.inputSchema.safeParse({
        ...base,
        scope: { kind: 'course', courseId: 'course-1' },
        references: Array.from({ length: 26 }, (_, index) => ({
          kind: 'card',
          id: `card-${index}`,
          label: 'x',
        })),
      }).success,
    ).toBe(false);
    expect(
      createMemory.inputSchema.safeParse({ ...base, provenance: { messageId: 'x'.repeat(161) } })
        .success,
    ).toBe(false);
    expect(
      searchMemories.inputSchema.safeParse({ scope: { kind: 'global' }, query: 'x'.repeat(1_001) })
        .success,
    ).toBe(false);
    expect(
      searchMemories.inputSchema.safeParse({ scope: { kind: 'global' }, limit: 51 }).success,
    ).toBe(false);
    expect(createMemory.inputSchema.safeParse({ ...base, tags: ['session'] }).success).toBe(false);
    expect(
      createMemory.inputSchema.safeParse({
        ...base,
        references: [{ kind: 'course', id: 'course-1', label: 'Biology' }],
      }).success,
    ).toBe(false);
  });
});
