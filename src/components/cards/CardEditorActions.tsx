// Action row for the card editor: Cancel/Done, Save & add
// another and the primary save. On touch it becomes a floating bottom bar so the
// controls stay within thumb reach.

import type { Ref } from 'react';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';

interface CardEditorActionsProps {
  editing: boolean;
  canSave: boolean;
  /** Cards already added this sitting; turns Cancel into Done. */
  addedCount: number;
  isTouchMode: boolean;
  onCancel: () => void;
  onSave: (andAnother: boolean) => void;
  saveAddRef: Ref<HTMLButtonElement>;
  saveRef: Ref<HTMLButtonElement>;
}

export function CardEditorActions({
  editing,
  canSave,
  addedCount,
  isTouchMode,
  onCancel,
  onSave,
  saveAddRef,
  saveRef,
}: CardEditorActionsProps) {
  return (
    <div
      role="region"
      aria-label="Card editor actions"
      className={cn(
        isTouchMode &&
          'fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 rounded-t-3xl bg-surface pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-5 pt-5 shadow-[0_-16px_40px_-24px_hsl(var(--ink)/0.3)] sm:bottom-0 sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-end gap-2.5',
          isTouchMode && 'mx-auto max-w-3xl',
        )}
      >
        {!editing && addedCount > 0 && (
          <span className="mr-auto text-sm tabular-nums text-ink-faint">
            {addedCount} added
          </span>
        )}
        <Button variant="ghost" size="lg" onClick={onCancel}>
          {!editing && addedCount > 0 ? 'Done' : 'Cancel'}
        </Button>
        {!editing && (
          <Button
            ref={saveAddRef as Ref<HTMLButtonElement>}
            variant="secondary"
            size="lg"
            onClick={() => onSave(true)}
            disabled={!canSave}
            title="Save and add another (Ctrl/Cmd+Enter)"
          >
            Save &amp; add another
          </Button>
        )}
        <Button
          ref={saveRef as Ref<HTMLButtonElement>}
          variant="primary"
          size="lg"
          onClick={() => onSave(false)}
          disabled={!canSave}
        >
          {editing ? 'Save changes' : 'Add card'}
        </Button>
      </div>
    </div>
  );
}
