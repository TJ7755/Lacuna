import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentMemoryRepository } from './agentMemoryRepository';
import { createCard, createCourse, createLesson, deleteLesson } from './repository';
import { db } from './schema';

afterEach(() => vi.restoreAllMocks());

describe('AgentMemoryRepository', () => {
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10);
    await Promise.all([
      db.agentMemories.clear(),
      db.tombstones.clear(),
      db.courses.clear(),
      db.lessons.clear(),
      db.cards.clear(),
      db.concepts.clear(),
      db.schedulingUnits.clear(),
    ]);
  });
  afterEach(async () => {
    await Promise.all([db.agentMemories.clear(), db.tombstones.clear()]);
  });

  it('validates ownership and hides expired memories from normal search', async () => {
    const course = await createCourse('Maths');
    const lesson = await createLesson(course.id, 'Algebra');
    const active = await agentMemoryRepository.create({
      courseId: course.id,
      tags: ['misconception'],
      content: 'Treats division as distributive over addition.',
      references: [{ kind: 'lesson', id: lesson.id, label: lesson.name }],
      basis: 'agent-inferred',
    });
    await agentMemoryRepository.create({
      courseId: course.id,
      tags: ['session'],
      content: 'Temporary session note.',
      basis: 'learner-stated',
      expiresAt: 1,
    });

    await expect(
      agentMemoryRepository.search({ scope: { kind: 'course', courseId: course.id } }),
    ).resolves.toEqual([active]);
    await expect(
      agentMemoryRepository.create({
        courseId: null,
        tags: ['context'],
        content: 'Invalid global reference.',
        references: [{ kind: 'course', id: course.id, label: course.name }],
        basis: 'learner-stated',
      }),
    ).rejects.toThrow('Invalid agent memory');
  });

  it('revalidates newly supplied references but permits correction after an old reference disappears', async () => {
    const course = await createCourse('Maths');
    const lesson = await createLesson(course.id, 'Algebra');
    const memory = await agentMemoryRepository.create({
      courseId: course.id,
      tags: ['misconception'],
      content: 'Original inference.',
      references: [{ kind: 'lesson', id: lesson.id, label: lesson.name }],
      basis: 'agent-inferred',
    });
    await deleteLesson(lesson.id);

    await expect(
      agentMemoryRepository.update(memory.id, { content: 'Learner correction.' }),
    ).resolves.toMatchObject({ content: 'Learner correction.' });
    await expect(
      agentMemoryRepository.update(memory.id, { references: memory.references }),
    ).rejects.toThrow('unavailable');
  });

  it('resolves Card ownership through its scheduling unit', async () => {
    const course = await createCourse('Maths');
    const card = await createCard(course.id, 'front_back', 'Question', 'Answer');
    await db.cards.update(card.id, { courseId: undefined });

    await expect(
      agentMemoryRepository.create({
        courseId: course.id,
        tags: ['context'],
        content: 'Relevant Card context.',
        references: [{ kind: 'card', id: card.id, label: card.front }],
        basis: 'learner-stated',
      }),
    ).resolves.toMatchObject({ courseId: course.id });
  });

  it('writes a tombstone and restores newer than the deletion', async () => {
    const memory = await agentMemoryRepository.create({
      courseId: null,
      tags: ['preference'],
      content: 'Prefer worked examples.',
      basis: 'learner-stated',
    });
    vi.spyOn(Date, 'now').mockReturnValue(20);
    const deleted = await agentMemoryRepository.delete(memory.id);
    expect(await db.tombstones.get(['agentMemories', memory.id])).toMatchObject({ deletedAt: 20 });

    const restored = await agentMemoryRepository.restore(deleted);
    expect(restored.updatedAt).toBe(21);
    expect(await db.tombstones.get(['agentMemories', memory.id])).toBeUndefined();
  });

  it('keeps identity, scope and creation time immutable at the runtime boundary', async () => {
    const memory = await agentMemoryRepository.create({
      courseId: null,
      tags: ['context'],
      content: 'Original.',
      basis: 'learner-stated',
    });
    vi.spyOn(Date, 'now').mockReturnValue(20);
    const updated = await agentMemoryRepository.update(memory.id, {
      content: 'Corrected.',
      id: 'replacement',
      courseId: 'course-elsewhere',
      createdAt: 99,
    } as never);
    expect(updated).toMatchObject({ id: memory.id, courseId: null, createdAt: 10 });
  });
});
