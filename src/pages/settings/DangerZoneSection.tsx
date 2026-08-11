import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmInline } from '../../components/ui/ConfirmInline';
import { useToast } from '../../components/ui/Toast';

export interface DangerZoneSectionProps {
  /** Singular label for the entity being deleted, e.g. "deck" or "course". */
  entityLabel: string;
  /** Name shown in the delete toast, e.g. the deck or course's own name. */
  entityName: string;
  /** Description of what deletion removes, shown above the delete button. */
  description: string;
  /**
   * Take a restorable snapshot immediately before deletion. May resolve to null
   * when there is nothing left to snapshot (e.g. the entity vanished after the
   * page loaded), in which case the toast offers no Undo action.
   */
  snapshot: () => Promise<unknown>;
  /** Delete the entity. */
  onDelete: () => Promise<void>;
  /** Restore the entity from a snapshot previously returned by `snapshot`. */
  onRestore: (snapshot: unknown) => Promise<void>;
  /** Called after deletion completes, typically to navigate away. */
  onDeleted: () => void;
}

/**
 * Danger-zone delete section shared by deck/course settings pages. Consequences are
 * confirmed before the recoverable snapshot-and-delete operation runs.
 */
export function DangerZoneSection({
  entityLabel,
  entityName,
  description,
  snapshot,
  onDelete,
  onRestore,
  onDeleted,
}: DangerZoneSectionProps) {
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    const snap = await snapshot();
    await onDelete();
    // A null snapshot cannot be restored, so offer no Undo in that case.
    notify(
      `'${entityName}' deleted.`,
      'neutral',
      snap === null || snap === undefined
        ? undefined
        : {
            actionLabel: 'Undo',
            onAction: () => {
              void onRestore(snap);
            },
          },
    );
    onDeleted();
  }

  return (
    <section className="rounded-2xl border border-negative/30 bg-negative/5 p-6 shadow-sm shadow-negative/10">
      <div className="mb-1 text-sm font-medium text-negative">Danger zone</div>
      <p className="mb-4 text-sm text-ink-soft">{description}</p>
      {confirming ? (
        <ConfirmInline
          message={`Delete '${entityName}' and its local study data?`}
          confirmLabel={`Delete ${entityLabel}`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void handleDelete()}
        />
      ) : (
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Delete {entityLabel}
        </Button>
      )}
    </section>
  );
}
