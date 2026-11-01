import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { db } from '../db/schema';
import { referencedAssetHashesInValues } from '../db/assets';
import { useCourse } from '../state/useCourseData';
import { canEditLessons } from '../course/lessonViewMode';
import { questionSetReturn } from '../questions/questionSetNavigation';
import { validateQuestionSet } from '@lacuna/core/questions/questionSets';
import { useQuestionSetEditor } from '../components/question-sets/useQuestionSetEditor';
import { QuestionComposer } from '../components/question-sets/QuestionComposer';
import { QuestionSetDetails } from '../components/question-sets/QuestionSetDetails';
import { QuestionSetSaveStatus } from '../components/question-sets/QuestionSetSaveStatus';
import { QuestionSetPreview } from '../components/question-sets/QuestionSetPreview';
import { QuestionSetDraftFeedback } from '../components/question-sets/QuestionSetDraftFeedback';
import { Button } from '../components/ui/Button';
import { ConfirmInline } from '../components/ui/ConfirmInline';
import {
  QuestionSetLoading,
  QuestionSetUnavailable,
} from '../components/question-sets/QuestionSetRouteState';
import '../components/question-sets/question-sets.css';
import '../components/question-sets/question-composer.css';

export function QuestionSetEditor() {
  const { courseId, setId } = useParams<{ courseId: string; setId: string }>();
  const course = useCourse(courseId);
  if (!course) return <QuestionSetLoading />;
  if (!canEditLessons(course) || course.archived)
    return (
      <QuestionSetUnavailable
        title="This course is read-only"
        backTo={`/course/${courseId}/questions`}
      >
        You can view its question sets, but cannot edit them here. Your saved drafts are kept.
      </QuestionSetUnavailable>
    );
  return <PaperEditor key={`${courseId}:${setId}`} courseId={courseId!} setId={setId!} />;
}
function PaperEditor({ courseId, setId }: { courseId: string; setId: string }) {
  const { session, snapshot, loadError, missing, retryLoad, blocker } = useQuestionSetEditor(
    courseId,
    setId,
  );
  const navigate = useNavigate();
  const origin = questionSetReturn(useLocation().state, courseId);
  const [preview, setPreview] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const focusAfterRetry = useRef(false);
  useEffect(() => {
    if (!focusAfterRetry.current || !session || !snapshot?.draft) return;
    focusAfterRetry.current = false;
    if (document.activeElement === document.body)
      editor.current?.querySelector('textarea')?.focus();
  }, [session, snapshot?.draft]);
  const back = origin?.questionSetReturnTo ?? `/course/${courseId}/questions`;
  if (missing)
    return (
      <QuestionSetUnavailable title="Question set not found" backTo={back}>
        It may have been removed or belong to another course. Return to Questions to choose a set.
      </QuestionSetUnavailable>
    );
  if (loadError)
    return (
      <QuestionSetUnavailable
        title="Could not open this question set"
        backTo={back}
        detail={loadError}
        onRetry={() => {
          focusAfterRetry.current = true;
          retryLoad();
        }}
      >
        The saved draft could not be read. Try again; your saved work has not been removed.
      </QuestionSetUnavailable>
    );
  if (!session || !snapshot?.draft) return <QuestionSetLoading />;
  const content = snapshot.draft.content;
  const issues = validateQuestionSet(content);
  const busy = snapshot.phase === 'publishing' || snapshot.phase === 'loading';
  const publish = async () => {
    setValidationAttempt((value) => value + 1);
    setPreview(false);
    if (issues.length) {
      if (!content.title.trim())
        document.querySelector<HTMLButtonElement>('[aria-label="Set details"]')?.click();
      return;
    }
    setError('');
    try {
      const assets = await db.assets.bulkGet(referencedAssetHashesInValues(content));
      if (assets.some((asset) => !asset))
        throw new Error('An image is missing. Add it again before saving the set.');
      await session.publish();
      await navigate(`/course/${courseId}/question-sets/${setId}`, {
        replace: true,
        state: origin,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the set.');
    }
  };
  const message =
    error ||
    (snapshot.error instanceof Error
      ? snapshot.error.message
      : snapshot.error
        ? String(snapshot.error)
        : '');
  return (
    <div
      ref={editor}
      className="qs-editor qs-composer"
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.nativeEvent.keyCode === 229
        )
          return;
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          if (!busy && !snapshot.requiresReload) void publish();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          if (preview) setPreview(false);
          else void navigate(back, { state: { returning: true } });
        }
      }}
    >
      <Link className="qs-back" to={back}>
        ← Question sets
      </Link>
      <header className="qs-composer-header">
        <h1 className="font-display text-4xl font-semibold tracking-tight outline-none focus-visible:shadow-none">
          {content.title.trim() || 'Untitled set'}
        </h1>
        <div className="qs-composer-actions">
          <QuestionSetSaveStatus
            snapshot={snapshot}
            onRetry={
              !snapshot.conflictSource
                ? () => void session.retry().catch(() => undefined)
                : undefined
            }
          />
          <QuestionSetDetails
            content={content}
            disabled={busy || snapshot.requiresReload}
            invalid={validationAttempt > 0 && !content.title.trim()}
            onChange={(next) => session.update(() => next)}
          />
          <Button variant="secondary" disabled={busy} onClick={() => setPreview(!preview)}>
            {preview ? 'Back to composer' : 'Preview'}
          </Button>
          <Button
            variant="primary"
            disabled={busy || snapshot.requiresReload}
            onClick={() => void publish()}
          >
            Save set
          </Button>
        </div>
      </header>
      {message && (
        <QuestionSetDraftFeedback
          message={message}
          showRetry={false}
          snapshot={snapshot}
          session={session}
          content={content}
          courseId={courseId}
          setError={setError}
          setConfirm={setConfirm}
          onCopied={(id) =>
            void navigate(`/course/${courseId}/question-sets/${id}/edit`, { state: origin })
          }
        />
      )}
      {blocker.state === 'blocked' && (
        <div className="qs-error">
          <p>Save this draft before leaving.</p>
          <Button variant="secondary" onClick={() => blocker.reset()}>
            Stay here
          </Button>
        </div>
      )}
      {confirm && (
        <div className="qs-error">
          <ConfirmInline
            message={confirm.message}
            confirmLabel="Continue"
            focusOnMount="cancel"
            onConfirm={() => {
              confirm.run();
              setConfirm(null);
            }}
            onCancel={() => setConfirm(null)}
          />
        </div>
      )}
      <fieldset disabled={busy || snapshot.requiresReload} hidden={preview} className="min-w-0">
        <QuestionComposer
          content={content}
          session={session}
          issues={validationAttempt ? issues : []}
          focusIssue={validationAttempt}
        />
      </fieldset>
      {preview && (
        <section aria-label="Student preview">
          <p className="mb-5 text-sm text-ink-soft">
            Preview only. Your answers here are not recorded.
          </p>
          <QuestionSetPreview content={content} authorPreview />
        </section>
      )}
    </div>
  );
}
