import type { Card, ScheduleEdit } from './types';

/** A reset clears the memory state but keeps the review and lapse counts. */
const RESET = {
  state: 0 as const,
  stability: null,
  difficulty: null,
  due: null,
  scheduledDays: 0,
  learningSteps: 0,
  lastReviewed: null,
};

export function applyScheduleEdit<T extends Card>(card: T, edit: ScheduleEdit): T {
  return edit.kind === 'reset' ? { ...card, ...RESET } : { ...card, due: edit.due };
}

function editKey(edit: ScheduleEdit): string {
  return edit.kind === 'reset' ? `${edit.at}:reset` : `${edit.at}:due:${edit.due}`;
}

/**
 * Union edit logs in time order. A reset supersedes everything before it, so only
 * the edits from the latest reset onwards are kept. Undefined when none remain.
 */
export function mergeScheduleEdits(
  ...logs: (readonly ScheduleEdit[] | undefined)[]
): ScheduleEdit[] | undefined {
  const byKey = new Map<string, ScheduleEdit>();
  for (const log of logs) for (const edit of log ?? []) byKey.set(editKey(edit), edit);
  const edits = [...byKey.values()].sort(
    (a, b) => a.at - b.at || editKey(a).localeCompare(editKey(b)),
  );
  let lastReset = 0;
  edits.forEach((edit, index) => {
    if (edit.kind === 'reset') lastReset = index;
  });
  const kept = edits.slice(lastReset);
  return kept.length > 0 ? kept : undefined;
}
