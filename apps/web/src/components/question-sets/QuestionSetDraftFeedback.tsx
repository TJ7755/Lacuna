import { transitionedSetId } from '../../questions/questionTransition';
import { makeId } from '../../db/schema';
import {
  createEmptyQuestionSetDraft,
  saveQuestionSetDraft,
} from '../../questions/questionSetDrafts';
import type {
  QuestionSetDraftSession,
  QuestionSetDraftSessionSnapshot,
} from '../../questions/questionSetDraftSession';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { Button } from '../ui/Button';

export function QuestionSetDraftFeedback({
  message,
  snapshot,
  session,
  content,
  courseId,
  setError,
  setConfirm,
  onCopied,
  showRetry = true,
}: {
  showRetry?: boolean;
  message: string;
  snapshot: QuestionSetDraftSessionSnapshot;
  session: QuestionSetDraftSession;
  content: QuestionSet;
  courseId: string;
  setError: (message: string) => void;
  setConfirm: (confirmation: { message: string; run: () => void }) => void;
  onCopied: (id: string) => void;
}) {
  return (
    <div role="alert" className="qs-error">
      <p>
        {snapshot.conflictSource === 'published'
          ? 'The saved set has changed elsewhere. Your draft is preserved. Keep it as a separate set to avoid overwriting those changes.'
          : message}
      </p>
      {snapshot.conflictSource === 'published' && (
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const sourceId = makeId();
              const generated = snapshot.draft?.generated;
              const draft = createEmptyQuestionSetDraft(
                courseId,
                generated ? transitionedSetId(sourceId) : sourceId,
              );
              if (generated)
                draft.generated = { ...structuredClone(generated), sourceRevisionId: null };
              const { legacyQuestionId: _source, ...copy } = content;
              draft.content = {
                ...copy,
                id: draft.content.id,
                title: `${content.title} (copy)`,
                ...(generated ? { legacyQuestionId: sourceId } : {}),
              };
              await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
              onCopied(draft.content.id);
            } catch (cause) {
              setError(String(cause));
            }
          }}
        >
          Keep as a new set
        </Button>
      )}
      <div className="qs-actions">
        {showRetry && !snapshot.conflictSource && (
          <Button variant="secondary" onClick={() => void session.retry().catch(() => undefined)}>
            Retry save
          </Button>
        )}
        {snapshot.conflictSource !== 'published' && (
          <Button
            variant="secondary"
            onClick={() =>
              setConfirm({
                message: 'Discard unsaved edits and load the stored draft?',
                run: () => {
                  void session.load({ discardLocalChanges: true }).catch(() => undefined);
                  setError('');
                },
              })
            }
          >
            Reload draft
          </Button>
        )}
      </div>
    </div>
  );
}
