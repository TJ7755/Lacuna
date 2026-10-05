import { QuestionSetQuestionStep } from '../components/question-sets/QuestionSetQuestionStep';
import { QuestionSetContents, nodeLabel } from '../components/question-sets/QuestionSetContents';
import { questionSetReturn } from '../questions/questionSetNavigation';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { db, makeId } from '../db/schema';
import { referencedAssetHashesInValues } from '../db/assets';
import { QuestionSetDraftFeedback } from '../components/question-sets/QuestionSetDraftFeedback';
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
import { QuestionSetSettings } from '../components/question-sets/QuestionSetSettings';
import { QuestionSetPreview } from '../components/question-sets/QuestionSetPreview';
import {
  emptyAnswer,
  questionSetMarks,
  issueMessage,
} from '../components/question-sets/presentation';
import { Button } from '../components/ui/Button';
import { ConfirmInline } from '../components/ui/ConfirmInline';
import '../components/question-sets/question-sets.css';
import '../components/question-sets/question-set-flow.css';

type Step = 'setup' | 'contents' | 'question' | 'marks' | 'links' | 'review' | 'preview';
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
  const origin = questionSetReturn(useLocation().state, courseId);
  const [activeId, setActiveId] = useState('');
  const [selectedStep, setStep] = useState<Step | null>(null);
  const step = selectedStep ?? (snapshot?.draft?.content.title.trim() ? 'contents' : 'setup');
  useEffect(() => {
    if (selectedStep === null && snapshot?.draft)
      setStep(snapshot.draft.content.title.trim() ? 'contents' : 'setup');
  }, [snapshot, selectedStep]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.closest('header')?.scrollIntoView?.({ block: 'start' });
  }, [step, activeId]);
  const [error, setError] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  if (loadError)
    return (
      <div className="qs-editor qs-flow">
        <Link
          className="qs-back"
          to={origin?.questionSetReturnTo ?? `/course/${courseId}/questions`}
        >
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
  const label = active ? nodeLabel(nodes, active) : '';
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
    setStep('question');
  };
  const addChild = (parents: string[], stayOnParent = false) => {
    const parent = nodes.find((node) => node.id === parents.at(-1));
    const run = () =>
      mutate(() => {
        add(parents);
        if (stayOnParent && parent) setActiveId(parent.id);
      });
    if (parent?.node.answer?.allocations.length)
      setConfirm({
        message:
          'Make this an introduction for separate parts? Its answer format and mark scheme will be removed. The question text and images will stay.',
        run,
      });
    else run();
  };
  const openQuestion = (id: string) => {
    setActiveId(id);
    setStep('question');
    setShowIssues(false);
    setError('');
  };
  const nextFromQuestion = () => {
    if (!active?.node.prompt.trim()) {
      setError('Write the question before continuing.');
      return;
    }
    setError('');
    if (children.length) {
      openQuestion(children[0].id);
      return;
    }
    const answer = active.node.answer ?? emptyAnswer();
    if (
      answer.response.kind === 'multiple-choice' &&
      (answer.response.options.some((option) => !option.content.trim()) ||
        !answer.response.correctOptionIds.length)
    ) {
      setError('Complete the answer options and select the correct answer before continuing.');
      return;
    }
    if (!answer.allocations.length)
      updateAnswer({
        ...answer,
        allocations: [
          {
            id: makeId(),
            criterion: '',
            maxMarks: answer.maxMarks || 1,
            dimension: 'knowledge',
            targetConceptIds: [],
          },
        ],
      });
    setStep('marks');
  };
  const nextFromMarks = () => {
    const answer = active?.node.answer;
    if (
      !answer ||
      !answer.allocations.length ||
      answer.allocations.some(
        (a) => !a.criterion.trim() || !Number.isSafeInteger(a.maxMarks) || a.maxMarks < 1,
      ) ||
      answer.maxMarks !== answer.allocations.reduce((sum, a) => sum + a.maxMarks, 0)
    ) {
      setError('Describe what earns each mark and use positive whole numbers.');
      return;
    }
    setError('');
    setStep('links');
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
    <div className="qs-editor qs-flow">
      <header className="qs-editor-header">
        <div className="qs-editor-title">
          <Link
            className="qs-back"
            to={origin?.questionSetReturnTo ?? `/course/${courseId}/questions`}
          >
            ← Question sets
          </Link>
          {step !== 'setup' && <p className="qs-muted">{content.title}</p>}
          <h1 ref={heading} tabIndex={-1}>
            {step === 'setup'
              ? content.title
                ? 'Set details'
                : 'Create a question set'
              : step === 'contents'
                ? 'Questions in this set'
                : step === 'question'
                  ? `Write ${label}`
                  : step === 'marks'
                    ? `Mark scheme for ${label}`
                    : step === 'links'
                      ? `Link knowledge to ${label}`
                      : step === 'review'
                        ? 'Review your question set'
                        : 'Student preview'}
          </h1>
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
      </header>
      {message && (
        <QuestionSetDraftFeedback
          message={message}
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
      <fieldset disabled={busy || snapshot.requiresReload} className="qs-flow-body">
        {(['question', 'marks', 'links'] as Step[]).includes(step) && (
          <ol className="qs-flow-progress" aria-label="Question editing progress">
            {(['question', 'marks', 'links'] as const).map((item, index) => (
              <li key={item} aria-current={step === item ? 'step' : undefined}>
                <span>{index + 1}</span>
                {item === 'question'
                  ? 'Question'
                  : item === 'marks'
                    ? 'Mark scheme'
                    : 'Linked knowledge'}
              </li>
            ))}
          </ol>
        )}
        {step === 'setup' && (
          <>
            <section className="qs-paper">
              <label className="qs-field">
                Set title
                <input
                  value={content.title}
                  placeholder="Name this question set"
                  onChange={(event) =>
                    mutate(() => session.update((set) => ({ ...set, title: event.target.value })))
                  }
                />
              </label>
              <p className="qs-muted">Group questions for a lesson, topic or practice paper.</p>
              <QuestionSetSettings
                content={content}
                onChange={(next) => mutate(() => session.update(() => next))}
              />
            </section>
            <footer className="qs-flow-footer">
              <Button
                variant="primary"
                onClick={() => {
                  if (!content.title.trim()) setError('Give this set a title.');
                  else {
                    setError('');
                    setStep('contents');
                  }
                }}
              >
                Continue to questions
              </Button>
            </footer>
          </>
        )}
        {(step === 'contents' || step === 'review') && (
          <>
            <div className="qs-flow-set-summary">
              <span>
                {content.questions.length}{' '}
                {content.questions.length === 1 ? 'question' : 'questions'} ·{' '}
                {questionSetMarks(content)} {questionSetMarks(content) === 1 ? 'mark' : 'marks'}
              </span>
              <Button variant="ghost" onClick={() => setStep('setup')}>
                Edit set details
              </Button>
            </div>
            {step === 'review' && (
              <p className="qs-muted mb-5">
                Check the questions and mark schemes before making this set available for practice.
              </p>
            )}
            <QuestionSetContents
              content={content}
              review={step === 'review'}
              onEdit={openQuestion}
              onAdd={(parents) => (parents.length ? addChild(parents) : mutate(() => add([])))}
              onMove={(id, index) =>
                mutate(() => session.update((set) => moveQuestionSetNode(set, id, index)))
              }
              onRemove={(id) =>
                setConfirm({
                  message: `Remove ${nodeLabel(
                    nodes,
                    nodes.find((n) => n.id === id)!,
                  )} and all its parts?`,
                  run: () => mutate(() => session.update((set) => removeQuestionSetNode(set, id))),
                })
              }
            />
            <footer className="qs-flow-footer">
              {step === 'contents' ? (
                <Button
                  variant="primary"
                  disabled={!content.questions.length}
                  onClick={() => {
                    setShowIssues(true);
                    setStep('review');
                  }}
                >
                  Review set
                </Button>
              ) : (
                <>
                  <Button onClick={() => setStep('contents')}>Back to questions</Button>
                  <Button onClick={() => setStep('preview')}>Preview as student</Button>
                  <Button variant="primary" onClick={() => void publish()}>
                    Save set
                  </Button>
                </>
              )}
            </footer>
          </>
        )}
        {active && (step === 'question' || step === 'marks' || step === 'links') && (
          <>
            <QuestionSetQuestionStep
              step={step}
              active={active}
              nodes={nodes}
              session={session}
              courseId={courseId}
              onPrompt={(prompt) =>
                mutate(() =>
                  session.update((set) => updateQuestionSetNodePrompt(set, active.id, prompt)),
                )
              }
              onAnswer={updateAnswer}
              onSplit={() => addChild([...active.parentIds, active.id], true)}
            />
            <footer className="qs-flow-footer">
              <Button
                onClick={() => {
                  setError('');
                  setStep(step === 'marks' ? 'question' : step === 'links' ? 'marks' : 'contents');
                }}
              >
                {step === 'question' ? 'Back to questions' : 'Back'}
              </Button>
              <Button
                variant="primary"
                onClick={
                  step === 'question'
                    ? nextFromQuestion
                    : step === 'marks'
                      ? nextFromMarks
                      : () => setStep('contents')
                }
              >
                {step === 'question'
                  ? children.length
                    ? 'Continue to first part'
                    : 'Continue to mark scheme'
                  : step === 'marks'
                    ? 'Continue to linked knowledge'
                    : 'Done — back to questions'}
              </Button>
            </footer>
          </>
        )}
        {step === 'preview' && (
          <>
            <p className="qs-muted mb-5">Preview only. Your answers here are not recorded.</p>
            <QuestionSetPreview content={content} authorPreview />
            <footer className="qs-flow-footer">
              <Button onClick={() => setStep('review')}>Back to review</Button>
            </footer>
          </>
        )}
      </fieldset>
    </div>
  );
}
