import { useEffect, useRef, useState } from 'react';
import type { QuestionSetDraftSessionSnapshot } from '../../questions/questionSetDraftSession';

export function QuestionSetSaveStatus({ snapshot }: { snapshot: QuestionSetDraftSessionSnapshot }) {
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
        <p role="status" className="qs-error">
          Could not save
        </p>
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
