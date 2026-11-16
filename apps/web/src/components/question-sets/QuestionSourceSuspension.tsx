import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { updateFixedQuestion } from '../../questions/repository.authoring';
import { Toggle } from '../ui/Toggle';

/** Suspension remains source metadata even after the composer owns fixed content. */
export function QuestionSourceSuspension({
  sourceId,
  courseId,
  disabled,
}: {
  sourceId: string;
  courseId: string;
  disabled: boolean;
}) {
  const source = useLiveQuery(() => db.questions.get(sourceId), [sourceId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!source || source.kind !== 'fixed' || source.courseId !== courseId) return null;
  const suspend = async (suspended: boolean) => {
    if (disabled || saving) return;
    setSaving(true);
    setError('');
    try {
      await updateFixedQuestion(sourceId, { suspended });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change suspension.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-6">
      <Toggle
        checked={source.suspended}
        onChange={(suspended) => void suspend(suspended)}
        disabled={disabled || saving}
        label="Suspend this Question"
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
