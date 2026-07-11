import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { TrashIcon, EditIcon, PlusIcon } from '../../components/ui/icons';
import { useLessons, usePracticeNodes } from '../../state/useCourseData';
import { createPracticeNode, updatePracticeNode, deletePracticeNode } from '../../db/repository';
import { PracticeNodeFields } from '../../components/course/PracticeNodeFields';
import {
  emptyPracticeNodeDraft,
  draftFromPracticeNode,
  parseCardCount,
  type PracticeNodeDraft,
} from '../../components/course/practiceNodeDraft';

export interface PracticeNodesSectionProps {
  courseId: string;
}

/**
 * Course-only manual practice-node management: teacher-authored practice sessions
 * placed at a fixed gap on the course path (see src/course/path.ts's manual
 * placement rule). Auto-inserted practice slots are not listed here — they are
 * computed fresh on every path render from the live due-card backlog and are
 * never persisted (see PracticeNode.position's doc comment in db/types.ts).
 * Reads via usePracticeNodes/useLessons, writes directly to the repository —
 * mirrors ExamDatesSection's list/inline-edit shape.
 */
export function PracticeNodesSection({ courseId }: PracticeNodesSectionProps) {
  const lessons = useLessons(courseId);
  const practiceNodes = usePracticeNodes(courseId);
  const manualNodes = practiceNodes?.filter((n) => n.type === 'manual');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<PracticeNodeDraft>(emptyPracticeNodeDraft());

  function startAdd() {
    setDraft(emptyPracticeNodeDraft());
    setEditingId('new');
  }

  function startEdit(id: string) {
    const existing = manualNodes?.find((n) => n.id === id);
    if (!existing) return;
    setDraft(draftFromPracticeNode(existing));
    setEditingId(id);
  }

  function cancel() {
    setEditingId(null);
    setDraft(emptyPracticeNodeDraft());
  }

  async function save() {
    const name = draft.name.trim() || 'Practice';
    const opts = {
      position: draft.position,
      lessonIds: draft.lessonIds,
      cardCount: parseCardCount(draft.cardCount),
      randomize: draft.randomize,
    };
    if (editingId === 'new') {
      await createPracticeNode(courseId, { type: 'manual', name, ...opts });
    } else if (editingId) {
      await updatePracticeNode(editingId, { name, ...opts });
    }
    cancel();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete '${name}'? This cannot be undone.`)) return;
    await deletePracticeNode(id);
    if (editingId === id) cancel();
  }

  function describePosition(position: number | undefined): string {
    if (position === undefined) return 'Start of course';
    const sorted = [...(lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    let after: string | null = null;
    for (const lesson of sorted) {
      if (lesson.orderIndex <= position) after = lesson.name;
    }
    return after ? `After "${after}"` : 'Start of course';
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-faint">
        Teacher-placed practice sessions inserted at a fixed point on the course path,
        alongside any practice slots the course inserts automatically.
      </p>

      {manualNodes?.length === 0 && !editingId && (
        <p className="text-xs text-ink-faint">No manual practice nodes yet.</p>
      )}

      {manualNodes?.map((node) => (
        <div
          key={node.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
        >
          <div className="min-w-0">
            <div className="text-sm text-ink">{node.name}</div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {describePosition(node.position)}
              {node.lessonIds && node.lessonIds.length > 0
                ? ` · ${node.lessonIds.length} lesson${node.lessonIds.length === 1 ? '' : 's'}`
                : ' · all lessons'}
              {node.cardCount ? ` · ${node.cardCount} cards` : ''}
              {node.randomize ? ' · randomised' : ''}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => startEdit(node.id)} aria-label={`Edit ${node.name}`}>
              <EditIcon width={16} height={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove(node.id, node.name)}
              aria-label={`Delete ${node.name}`}
            >
              <TrashIcon width={16} height={16} />
            </Button>
          </div>
        </div>
      ))}

      {editingId ? (
        <div className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3">
          <PracticeNodeFields draft={draft} onChange={setDraft} lessons={lessons ?? []} />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void save()}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={startAdd} className="self-start">
          <PlusIcon width={16} height={16} />
          Add practice node
        </Button>
      )}
    </div>
  );
}
