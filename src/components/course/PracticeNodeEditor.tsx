// Modal editor for a manual practice node, opened from the path's Add practice
// action or an existing node's edit badge. Mirrors the chrome of CardEditOverlay.
// Settings links back here instead of maintaining a competing management surface.
//
// British English throughout.

import { useState } from 'react';
import { dialogKeyDown } from '../../hooks/dialogKeys';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';
import { useToast } from '../ui/Toast';
import {
  createPracticeNode,
  updatePracticeNode,
  deletePracticeNode,
} from '../../db/practiceNodeRepository';
import type { Lesson, PracticeNode } from '../../db/types';
import { PracticeNodeFields } from './PracticeNodeFields';
import { emptyPracticeNodeDraft, draftFromPracticeNode, parseCardCount } from './practiceNodeDraft';
import { DialogHeader, DialogPanel } from '../ui/DialogPanel';

interface PracticeNodeEditorProps {
  courseId: string;
  lessons: Lesson[];
  /** The node being edited; undefined when creating a new one. */
  node?: PracticeNode;
  /** Seeds a new node's position on the visible course path. */
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    try {
      await deletePracticeNode(node.id);
      onSaved();
    } catch (err) {
      setConfirmingDelete(false);
      notify(
        err instanceof Error ? err.message : 'Could not delete the practice node.',
        'negative',
      );
    }
  }

  return (
    <DialogPanel
      label={node ? 'Edit manual practice' : 'Add manual practice'}
      trapRef={trapRef}
      onBackdropClick={onCancel}
      className="max-h-[90vh] max-w-md"
      onKeyDown={dialogKeyDown({
        onCancel,
        onSubmit: () => {
          if (!saving) void handleSave();
        },
        enterSubmits: true,
      })}
    >
      <DialogHeader
        title={node ? 'Edit practice' : 'Add practice'}
        onClose={onCancel}
        closeLabel="Close editor"
      />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <PracticeNodeFields draft={draft} onChange={setDraft} lessons={lessons} />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
        {node ? (
          confirmingDelete ? (
            <ConfirmInline
              message="Delete?"
              onConfirm={() => void handleDelete()}
              onCancel={() => setConfirmingDelete(false)}
            />
          ) : (
            <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )
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
    </DialogPanel>
  );
}
