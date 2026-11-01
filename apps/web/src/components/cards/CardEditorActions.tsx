// Repeat-save leads new-card capture; editing leads with Save changes.
// On touch this becomes a floating bottom bar so the
// controls stay within thumb reach.

import { useEffect, useState, type Ref } from 'react';
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
  const [viewportInset, setViewportInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isTouchMode || !viewport) return;
    // Some mobile keyboards resize only the visual viewport, leaving fixed controls covered.
    // Replace the normal nav/safe-area offset whilst occluded rather than adding it twice.
    const measure = () =>
      setViewportInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, [isTouchMode]);
  return (
    <div
      role="region"
      aria-label="Card editor actions"
      style={isTouchMode && viewportInset > 0 ? { bottom: viewportInset } : undefined}
      className={cn(
        isTouchMode &&
          'fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-30 rounded-t-3xl bg-surface pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-2 shadow-[0_-16px_40px_-24px_hsl(var(--ink)/0.3)] sm:bottom-0 sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className={cn(
          // Give repeat entry the whole column; the shorter actions share a compact row.
          // Cancel reserves the same width as Done and never stretches to another control's height.
          'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5',
          isTouchMode && 'mx-auto max-w-3xl',
        )}
      >
        <Button
          variant="ghost"
          size="lg"
          style={{ paddingInline: '1rem' }}
          className="min-w-[6rem] justify-self-start py-2"
          onClick={onCancel}
        >
          {!editing && addedCount > 0 ? 'Done' : 'Cancel'}
        </Button>
        {!editing && (
          <Button
            ref={saveAddRef as Ref<HTMLButtonElement>}
            variant="primary"
            size="lg"
            onClick={() => onSave(true)}
            disabled={!canSave}
            title="Save and add another (Ctrl/Cmd+Enter)"
            style={{ paddingInline: '1rem' }}
            className="order-first col-span-2 w-full py-2"
          >
            Save &amp; add another
          </Button>
        )}
        <Button
          ref={saveRef as Ref<HTMLButtonElement>}
          variant={editing ? 'primary' : 'secondary'}
          size="lg"
          onClick={() => onSave(false)}
          disabled={!canSave}
          style={{ paddingInline: '1rem' }}
          className="justify-self-end py-2"
        >
          {editing ? 'Save changes' : 'Add card'}
        </Button>
        {!editing && (
          // Reserve the tally before the first save so both rows retain their bounds.
          <span
            role="status"
            className="col-span-2 min-h-[1.5em] text-center text-sm tabular-nums text-ink-faint"
          >
            {addedCount > 0 ? `${addedCount} added` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
