import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  createPracticeNode,
  deletePracticeNode,
  savePracticeMilestoneProgress,
  updatePracticeNode,
} from './practiceNodeRepository';

describe('practiceNodeRepository', () => {
  beforeEach(async () => {
    await Promise.all([db.practiceNodes.clear(), db.practiceMilestones.clear()]);
  });

  it('creates and updates a manual node', async () => {
    const node = await createPracticeNode('course-1', { type: 'manual', name: 'Practice' });
    await updatePracticeNode(node.id, { name: 'Past paper review', cardCount: 12 });

    expect(await db.practiceNodes.get(node.id)).toEqual(
      expect.objectContaining({ name: 'Past paper review', cardCount: 12 }),
    );
  });

  it('deletes a node and its milestone in one operation', async () => {
    const node = await createPracticeNode('course-1', { type: 'manual', name: 'Practice' });
    await savePracticeMilestoneProgress(node.id, 'course-1', 'scope-1', 2, 3, true, 100);

    await deletePracticeNode(node.id);

    expect(await db.practiceNodes.get(node.id)).toBeUndefined();
    expect(await db.practiceMilestones.get(node.id)).toBeUndefined();
  });

  it('preserves completion only within the same effective scope', async () => {
    await savePracticeMilestoneProgress('auto-1', 'course-1', 'scope-1', 3, 3, true, 100);
    const sameScope = await savePracticeMilestoneProgress(
      'auto-1',
      'course-1',
      'scope-1',
      1,
      3,
      false,
      200,
    );
    const changedScope = await savePracticeMilestoneProgress(
      'auto-1',
      'course-1',
      'scope-2',
      1,
      4,
      false,
      300,
    );

    expect(sameScope.completedAt).toBe(100);
    expect(changedScope.completedAt).toBeUndefined();
  });
});
