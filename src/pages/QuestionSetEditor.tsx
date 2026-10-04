import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, makeId } from '../db/schema';
import { referencedAssetHashesInValues } from '../db/assets';
import { createEmptyQuestionSetDraft, saveQuestionSetDraft } from '../questions/questionSetDrafts';
import { useCourse } from '../state/useCourseData';
import { canEditLessons } from '../course/lessonViewMode';
import {
  addQuestionSetNode,
  flattenQuestionSet,
  moveQuestionSetNode,
  removeQuestionSetNode,
  updateQuestionSetNodeAnswer,
  updateQuestionSetNodePrompt,
} from '../questions/questionSetAuthoring';
import { validateQuestionSet, type QuestionAnswer } from '../questions/questionSets';
import { useQuestionSetEditor } from '../components/question-sets/useQuestionSetEditor';
import { QuestionSetSchemeEditor } from '../components/question-sets/QuestionSetSchemeEditor';
import { QuestionSetResponseEditor } from '../components/question-sets/QuestionSetResponseEditor';
import { QuestionSetLinksEditor } from '../components/question-sets/QuestionSetLinksEditor';
import { QuestionSetSettings } from '../components/question-sets/QuestionSetSettings';
import { QuestionSetImage } from '../components/question-sets/QuestionSetImage';
import { QuestionSetPreview } from '../components/question-sets/QuestionSetPreview';
import {
  emptyAnswer,
  nodeMarks,
  questionSetMarks,
  issueMessage,
} from '../components/question-sets/presentation';
import { QuestionSetPromptEditor } from '../components/question-sets/QuestionSetPromptEditor';
import { MarkdownView } from '../components/markdown/MarkdownView';
import { Button } from '../components/ui/Button';
import { ConfirmInline } from '../components/ui/ConfirmInline';
import '../components/question-sets/question-sets.css';

type Step = 'Question' | 'Mark scheme' | 'Links';
export function QuestionSetEditor() {
  const { courseId, setId } = useParams<{ courseId: string; setId: string }>();
  const course = useCourse(courseId);
  if (!course) return <p className="p-8">Loading course…</p>;
  if (!canEditLessons(course) || course.archived)
    return (
      <p className="p-8">
        This course is read-only.{' '}
        <Link to={`/course/${courseId}/questions`}>Back to Questions</Link>
      </p>
    );
  return <PaperEditor key={`${courseId}:${setId}`} courseId={courseId!} setId={setId!} />;
}
function PaperEditor({ courseId, setId }: { courseId: string; setId: string }) {
  const { session, snapshot, loadError, blocker } = useQuestionSetEditor(courseId, setId);
  const navigate = useNavigate();
  const activeKey = `question-set-active:${courseId}:${setId}`;
  const [activeId, setActive] = useState(() => sessionStorage.getItem(activeKey) ?? '');
  const setActiveId = (id: string) => {
    sessionStorage.setItem(activeKey, id);
    setActive(id);
  };
  const [step, setStep] = useState<Step>('Question');
  const [outline, setOutline] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  if (loadError)
    return (
      <div className="qs-editor">
        <Link className="qs-back" to={`/course/${courseId}/questions`}>
          ← Questions
        </Link>
        <p role="alert" className="qs-error">
          {loadError}
        </p>
      </div>
    );
  if (!session || !snapshot?.draft) return <p className="p-8">Loading question set…</p>;
  const content = snapshot.draft.content;
  const nodes = flattenQuestionSet(content);
  const active = nodes.find((n) => n.id === activeId) ?? nodes[0];
  const children = active ? nodes.filter((n) => n.parentIds.at(-1) === active.id) : [];
  const siblings = active
    ? nodes.filter(
        (n) => n.depth === active.depth && n.parentIds.join('/') === active.parentIds.join('/'),
      )
    : [];
  const siblingIndex = siblings.findIndex((n) => n.id === active?.id);
  const label = active
    ? [...active.parentIds.map((id) => nodes.find((n) => n.id === id)!.label), active.label].join(
        ' ',
      )
    : '';
  const issues = validateQuestionSet(content);
  const busy = snapshot.phase === 'publishing' || snapshot.phase === 'loading';
  const mutate = (run: () => void) => {
    try {
      run();
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the draft.');
    }
  };
  const updateAnswer = (answer: QuestionAnswer) =>
    mutate(() => session.update((s) => updateQuestionSetNodeAnswer(s, active.id, answer)));
  const add = (parents: string[]) => {
    const id = makeId();
    session.update((s) => {
      let next = s;
      if (parents.length) next = updateQuestionSetNodeAnswer(next, parents.at(-1)!, undefined);
      next = addQuestionSetNode(next, { parentIds: parents, id });
      return next;
    });
    setActiveId(id);
    setStep('Question');
    setOutline(false);
  };
  const addChild = () => {
    if (!active) return;
    const run = () => mutate(() => add([...active.parentIds, active.id]));
    if (active.node.answer)
      setConfirm({
        message:
          'Make this shared source material? Its answer format and mark scheme will be removed.',
        run,
      });
    else run();
  };
  const chooseStep = (next: Step) => {
    if (!active) return;
    if (next !== 'Question' && !active.node.answer)
      mutate(() => session.update((s) => updateQuestionSetNodeAnswer(s, active.id, emptyAnswer())));
    setStep(next);
  };
  const publish = async () => {
    setShowIssues(true);
    if (issues.length) return;
    setError('');
    try {
      const assets = await db.assets.bulkGet(referencedAssetHashesInValues(content));
      if (assets.some((asset) => !asset))
        throw new Error('An image is missing. Add it again before saving the set.');
      await session.publish();
      await navigate(`/course/${courseId}/question-sets/${setId}`, { replace: true });
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
    <div className="qs-editor">
      <header className="qs-editor-header">
        <div className="qs-editor-title">
          <Link className="qs-back" to={`/course/${courseId}/questions`}>
            ← Question sets
          </Link>
          <input
            className="qs-title"
            aria-label="Set title"
            placeholder="Untitled question set"
            value={content.title}
            disabled={busy}
            onChange={(e) => mutate(() => session.update((s) => ({ ...s, title: e.target.value })))}
          />
          <p className="qs-status" role="status">
            {snapshot.phase === 'error'
              ? 'Could not save'
              : snapshot.dirty || snapshot.phase === 'saving'
                ? 'Saving…'
                : snapshot.phase === 'publishing'
                  ? 'Saving set…'
                  : 'Draft saved on this device'}{' '}
            · {questionSetMarks(content)} {questionSetMarks(content) === 1 ? 'mark' : 'marks'}
          </p>
        </div>
        <div className="qs-actions">
          <Button variant="secondary" onClick={() => setPreview(!preview)}>
            {preview ? 'Back to editor' : 'Preview'}
          </Button>
          <Button disabled={busy} onClick={() => void publish()}>
            Save set
          </Button>
        </div>
      </header>
      {message && (
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
                  const draft = createEmptyQuestionSetDraft(courseId, makeId());
                  draft.content = {
                    ...content,
                    id: draft.content.id,
                    title: `${content.title} (copy)`,
                  };
                  await saveQuestionSetDraft(draft, { expectedDraftRevisionId: null });
                  await navigate(`/course/${courseId}/question-sets/${draft.content.id}/edit`);
                } catch (cause) {
                  setError(String(cause));
                }
              }}
            >
              Keep as a new set
            </Button>
          )}
          <div className="qs-actions">
            {!snapshot.conflictSource && (
              <Button
                variant="secondary"
                onClick={() => void session.retry().catch(() => undefined)}
              >
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
            onConfirm={() => {
              confirm.run();
              setConfirm(null);
            }}
            onCancel={() => setConfirm(null)}
            focusOnMount="cancel"
          />
        </div>
      )}
      {showIssues && issues.length > 0 && (
        <div className="qs-error" role="alert">
          <p>Complete these before saving the set:</p>
          <ul className="qs-issues">
            {issues.map((issue, i) => (
              <li key={i}>{issueMessage(content, issue)}</li>
            ))}
          </ul>
        </div>
      )}
      {preview ? (
        <>
          <p className="qs-muted mb-5">Author preview · answers are not saved as practice.</p>
          <QuestionSetPreview content={content} authorPreview />
        </>
      ) : (
        <fieldset disabled={busy || snapshot.requiresReload}>
          <QuestionSetSettings
            content={content}
            onChange={(next) => mutate(() => session.update(() => next))}
          />
          <div className="qs-toolbar">
            <button
              className="qs-back"
              aria-expanded={outline}
              onClick={() => setOutline(!outline)}
            >
              Questions · {content.questions.length} ▾
            </button>
            {active && children.length === 0 && (
              <div className="qs-step-tabs" role="tablist" aria-label="Editing step">
                {(['Question', 'Mark scheme', 'Links'] as Step[]).map((s) => (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={step === s}
                    onClick={() => chooseStep(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {outline && (
            <nav className="qs-outline" aria-label="Question outline">
              {nodes.map((n) => (
                <button
                  key={n.id}
                  aria-current={active?.id === n.id}
                  style={{ paddingLeft: 12 + n.depth * 18 }}
                  onClick={() => {
                    setActiveId(n.id);
                    setStep('Question');
                    setOutline(false);
                  }}
                >
                  {n.label} ·{' '}
                  {n.node.prompt.replace(/!\[.*?\]\(.*?\)/g, 'Diagram').slice(0, 65) || 'Untitled'}
                </button>
              ))}
              <Button variant="secondary" onClick={() => mutate(() => add([]))}>
                Add question
              </Button>
            </nav>
          )}
          {active ? (
            <article className="qs-paper">
              <header className="qs-part-bar">
                <h2>{label}</h2>
                <span className="qs-muted">
                  {children.length
                    ? 'Shared source'
                    : `${nodeMarks(active.node)} ${nodeMarks(active.node) === 1 ? 'mark' : 'marks'}`}
                </span>
              </header>
              {active.parentIds.map((id) => (
                <details className="qs-source" key={id} open={step === 'Question'}>
                  <summary>Source · {nodes.find((n) => n.id === id)!.label}</summary>
                  <MarkdownView source={nodes.find((n) => n.id === id)!.node.prompt} />
                </details>
              ))}
              {step === 'Question' || children.length > 0 ? (
                <>
                  <QuestionSetPromptEditor
                    key={`${active.id}-prompt`}
                    shared={children.length > 0}
                    value={active.node.prompt}
                    onChange={(prompt) =>
                      mutate(() =>
                        session.update((s) => updateQuestionSetNodePrompt(s, active.id, prompt)),
                      )
                    }
                  />
                  <QuestionSetImage
                    key={`${active.id}-image`}
                    session={session}
                    nodeId={active.id}
                  />
                  {children.length === 0 && (
                    <QuestionSetResponseEditor
                      key={active.id}
                      answer={active.node.answer ?? emptyAnswer()}
                      onChange={updateAnswer}
                    />
                  )}
                </>
              ) : step === 'Mark scheme' ? (
                <QuestionSetSchemeEditor
                  key={active.id}
                  answer={active.node.answer ?? emptyAnswer()}
                  onChange={updateAnswer}
                />
              ) : (
                <QuestionSetLinksEditor
                  key={active.id}
                  courseId={courseId}
                  answer={active.node.answer ?? emptyAnswer()}
                  onChange={updateAnswer}
                />
              )}
              <footer className="qs-node-tools">
                {active.depth < 2 && (
                  <Button variant="secondary" onClick={addChild}>
                    {active.depth === 0 ? 'Add part' : 'Add subpart'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={siblingIndex <= 0}
                  onClick={() =>
                    mutate(() =>
                      session.update((s) => moveQuestionSetNode(s, active.id, siblingIndex - 1)),
                    )
                  }
                >
                  Move up
                </Button>
                <Button
                  variant="secondary"
                  disabled={siblingIndex >= siblings.length - 1}
                  onClick={() =>
                    mutate(() =>
                      session.update((s) => moveQuestionSetNode(s, active.id, siblingIndex + 1)),
                    )
                  }
                >
                  Move down
                </Button>
                <button
                  className="qs-back"
                  onClick={() =>
                    setConfirm({
                      message: `Remove ${label} and all its content?`,
                      run: () =>
                        mutate(() => {
                          session.update((s) => removeQuestionSetNode(s, active.id));
                          setActiveId('');
                          setStep('Question');
                        }),
                    })
                  }
                >
                  Remove
                </button>
                {children.length === 0 && step === 'Question' && (
                  <Button onClick={() => chooseStep('Mark scheme')}>Define marks →</Button>
                )}
              </footer>
            </article>
          ) : (
            <div className="qs-empty">
              <p>No questions in this set.</p>
              <Button onClick={() => mutate(() => add([]))}>Add question</Button>
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
