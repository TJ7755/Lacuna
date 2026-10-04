import { QuestionSetPanel } from './QuestionSetPanel';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { removeAuthoredQuestionSet } from '../../questions/questionSetRepository';
import { Button } from '../ui/Button';
import { ConfirmInline } from '../ui/ConfirmInline';

export function QuestionSetLibraryActions({
  courseId,
  setId,
  title,
  contentRevisionId,
  draftRevisionId,
  onRemoved,
}: {
  courseId: string;
  setId: string;
  title: string;
  contentRevisionId: string | null;
  draftRevisionId: string | null;
  onRemoved: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [confirmation, setConfirmation] = useState<{
    expectedContentRevisionId: string | null;
    expectedDraftRevisionId: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = () => {
    setConfirmation(null);
    setError('');
    requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>('[data-remove-set]')?.focus(),
    );
  };
  const remove = async () => {
    if (!confirmation || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await removeAuthoredQuestionSet(courseId, setId, confirmation);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this set.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <QuestionSetPanel
      title={`Options for ${title}`}
      triggerLabel="Options"
      className="qs-library-options"
    >
      <div ref={root}>
        {busy ? (
          <p role="status">Removing…</p>
        ) : confirmation ? (
          <ConfirmInline
            message="Remove this set? Saved attempts will remain."
            confirmLabel="Remove set"
            focusOnMount="cancel"
            announce
            onConfirm={() => void remove()}
            onCancel={cancel}
          />
        ) : (
          <>
            <Link to={`/share?courseId=${encodeURIComponent(courseId)}`}>Share course</Link>
            <Button
              variant="ghost"
              data-remove-set
              onClick={() => {
                setError('');
                setConfirmation({
                  expectedContentRevisionId: contentRevisionId,
                  expectedDraftRevisionId: draftRevisionId,
                });
              }}
            >
              Remove set
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="qs-error">
            {error}
          </p>
        )}
      </div>
    </QuestionSetPanel>
  );
}
