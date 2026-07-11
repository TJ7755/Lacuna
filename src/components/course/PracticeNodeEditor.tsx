// Modal editor for a manual practice node, opened directly from the course path
// (see CoursePath.tsx's insertion "+" affordance and the edit badge on PracticeNode).
// Mirrors the chrome of CardEditOverlay; the fields themselves are shared with the
// course-settings management list via PracticeNodeFields so the two entry points
// stay in lockstep.
//
// British English throughout.

import { useState } from 'react';
import { m as motion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { CloseIcon } from '../ui/icons';
import { createPracticeNode, updatePracticeNode, deletePracticeNode } from '../../db/repository';
import type { Lesson, PracticeNode } from '../../db/types';
import { PracticeNodeFields } from './PracticeNodeFields';
import {
  emptyPracticeNodeDraft,
  draftFromPracticeNode,
  parseCardCount,
} from './practiceNodeDraft';

interface PracticeNodeEditorProps {
  courseId: string;
  lessons: Lesson[];
  /** The node being edited; undefined when creating a new one. */
  node?: PracticeNode;
  /** Seeds a new node's position, e.g. the gap the teacher clicked "+" on. */
  defaultPosition?: number;
  onSaved: () => void;
  onCancel: () => void;
}

export function PracticeNodeEditor({
  courseId,
  lessons,
  node,
  defaultPosition,
  onSaved,
  onCancel,
}: PracticeNodeEditorProps) {
  const { notify } = useToast();
  const trapRef = useFocusTrap(true);
  const [draft, setDraft] = useState(() =>
    node ? draftFromPracticeNode(node) : emptyPracticeNodeDraft(defaultPosition),
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const name = draft.name.trim() || 'Practice';
    const opts = {
      position: draft.position,
      lessonIds: draft.lessonIds,
      cardCount: parseCardCount(draft.cardCount),
      randomize: draft.randomize,
    };
    try {
      if (node) {
        await updatePracticeNode(node.id, { name, ...opts });
      } else {
        await createPracticeNode(courseId, { type: 'manual', name, ...opts });
      }
      onSaved();
    } catch (err) {
      setSaving(false);
      notify(err instanceof Error ? err.message : 'Could not save the practice node.', 'negative');
    }
  }

  async function handleDelete() {
    if (!node) return;
    if (!window.confirm(`Delete '${node.name}'? This cannot be undone.`)) return;
    try {
      await deletePracticeNode(node.id);
      onSaved();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the practice node.', 'negative');
    }
  }

  return (
    <motion.div
      ref={trapRef}
      className="fixed inset-0 z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={node ? 'Edit practice node' : 'Add practice node'}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative z-10 m-auto flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line-strong bg-paper shadow-2xl shadow-black/20"
      >
        <div className="absolute inset-0 bg-dot-grid opacity-20" aria-hidden="true" />
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl">{node ? 'Edit practice' : 'Add practice'}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close editor"
            title="Close (Esc)"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <PracticeNodeFields draft={draft} onChange={setDraft} lessons={lessons} />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          {node ? (
            <Button variant="danger" size="sm" onClick={() => void handleDelete()}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
              Save
            </Button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}
