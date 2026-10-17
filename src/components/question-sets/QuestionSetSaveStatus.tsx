import { useEffect, useRef, useState } from 'react';
import type { QuestionSetDraftSessionSnapshot } from '../../questions/questionSetDraftSession';

export function QuestionSetSaveStatus({
  snapshot,
  onRetry,
}: {
  snapshot: QuestionSetDraftSessionSnapshot;
  onRetry?: () => void;
}) {
  const saving = snapshot.dirty || snapshot.phase === 'saving' || snapshot.phase === 'publishing';
  const wasSaving = useRef(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (wasSaving.current && !saving && snapshot.phase === 'idle') setSaved(true);
    if (saving) setSaved(false);
    wasSaving.current = saving;
  }, [saving, snapshot.phase]);
  return (
    <>
      {snapshot.phase === 'error' ? (
        <div className="flex items-center gap-2 text-xs text-negative">
          <p role="status">Could not save</p>
          {onRetry && (
            <button
              type="button"
              aria-label="Retry save"
              onClick={onRetry}
              className="min-h-11 text-accent-ink"
            >
              Retry
            </button>
          )}
        </div>
      ) : saving ? (
        <p role="status" className="text-xs text-ink-faint">
          Saving…
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {saved ? 'Saved' : ''}
      </p>
    </>
  );
}
