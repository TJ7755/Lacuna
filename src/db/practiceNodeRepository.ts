import { db, makeId } from './schema';
import { friendlyDbError } from './dbErrors';
import type { PracticeMilestone, PracticeNode } from './types';
import { stampUpdatedAt, recordTombstone } from './mutationStamp';

export async function createPracticeNode(
  courseId: string,
  opts: Partial<PracticeNode> & Pick<PracticeNode, 'type' | 'name'>,
): Promise<PracticeNode> {
  try {
    const now = Date.now();
    const node = stampUpdatedAt({
      id: makeId(),
      courseId,
      createdAt: now,
      ...opts,
    }, now);
    await db.practiceNodes.add(node);
    return node;
  } catch (error) {
    throw friendlyDbError(error);
  }
}

export async function updatePracticeNode(
  id: string,
  changes: Partial<PracticeNode>,
): Promise<void> {
  try {
    await db.practiceNodes.update(id, stampUpdatedAt(changes));
  } catch (error) {
    throw friendlyDbError(error);
  }
}

export async function deletePracticeNode(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.practiceNodes, db.practiceMilestones, db.tombstones],
    async (tx) => {
      await recordTombstone(tx, 'practiceNodes', id);
      await recordTombstone(tx, 'practiceMilestones', id);
      await db.practiceMilestones.delete(id);
      await db.practiceNodes.delete(id);
    },
  );
}

/** Persist measured node progress, replacing progress from an obsolete effective scope. */
export async function savePracticeMilestoneProgress(
  nodeKey: string,
  courseId: string,
  scopeVersion: string,
  securedCardCount: number,
  totalCardCount: number,
  completed: boolean = false,
  now: number = Date.now(),
): Promise<PracticeMilestone> {
  const existing = await db.practiceMilestones.get(nodeKey);
  const sameScope = existing?.scopeVersion === scopeVersion;
  const milestone = stampUpdatedAt({
    nodeKey,
    courseId,
    scopeVersion,
    securedCardCount: Math.max(0, Math.min(securedCardCount, totalCardCount)),
    totalCardCount: Math.max(0, totalCardCount),
    ...(completed || (sameScope && existing.completedAt !== undefined)
      ? {
          completedAt:
            sameScope && existing?.completedAt !== undefined ? existing.completedAt : now,
        }
      : {}),
  }, now);
  await db.practiceMilestones.put(milestone);
  return milestone;
}
