import { projectPathSlots, type PathRowSlot } from './pathReorderLayout';
import type { DragState } from './bindPathTouchReorder';

type DropMarker = { edge: 'before' | 'after'; active: boolean };

export function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Project the landing gap, skipping rows carried with the dragged lesson. */
export function lessonPathReorderPreview({
  orderedIds,
  projectedIds,
  dragState,
  slots,
  itemById,
}: {
  orderedIds: string[];
  projectedIds: string[] | null;
  dragState: DragState | null;
  slots: Map<string, PathRowSlot> | undefined;
  itemById: Map<string, { dragId?: string }>;
}) {
  const projectedTops =
    dragState && slots
      ? projectPathSlots(orderedIds, projectedIds ?? orderedIds, slots)
      : new Map<string, number>();
  const dropMarkerByLessonId = new Map<string, DropMarker>();
  const result = { projectedTops, dropMarkerByLessonId };
  if (!dragState || dragState.dropping || !projectedIds) return result;
  const index = projectedIds.indexOf(dragState.lessonId);
  if (index < 0) return result;
  const isCompanion = (id: string) => (itemById.get(id)?.dragId ?? id) === dragState.lessonId;
  const next = projectedIds.slice(index + 1).find((id) => !isCompanion(id));
  const neighbour = next ?? projectedIds.slice(0, index).findLast((id) => !isCompanion(id));
  if (!neighbour) return result;
  const source = slots?.get(dragState.lessonId);
  const destination = projectedTops.get(dragState.lessonId);
  const aligned =
    !!source &&
    destination !== undefined &&
    Math.abs(source.top + (dragState.y ?? 0) - destination) <=
      Math.min(32, Math.max(12, source.height / 3));
  dropMarkerByLessonId.set(neighbour, {
    edge: next ? 'before' : 'after',
    active: !sameOrder(projectedIds, orderedIds) && aligned,
  });
  return result;
}
