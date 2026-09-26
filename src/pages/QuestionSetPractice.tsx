import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { flattenQuestionSet } from '../questions/questionSetAuthoring';
import { feedbackAvailable, type QuestionSetAttemptRecord } from '../questions/questionSetAttempts';
import {
  recordQuestionSetAssistance,
  completeQuestionSetAttempt,
  saveQuestionSetAttemptPosition,
  saveQuestionSetMarking,
  submitPracticeQuestion,
  submitQuestionSetPaper,
  type SaveQuestionSetMarkingInput,
  QuestionSetAttemptRevisionConflictError,
} from '../questions/questionSetAttemptRepository';
import { summariseSelfMarking } from '../questions/questionSets';
import { QuestionSetAnswer } from '../components/question-sets/QuestionSetAnswer';
import { QuestionSetRelatedKnowledge } from '../components/question-sets/QuestionSetRelatedKnowledge';
import { QuestionSetReflection } from '../components/question-sets/QuestionSetReflection';
import { QuestionSetMarking } from '../components/question-sets/QuestionSetMarking';
import {
  useAttemptProgress,
  useQuestionSetAttempt,
} from '../components/question-sets/useQuestionSetAttempt';
import type { QuestionSetAttemptSession } from '../components/question-sets/questionSetAttemptSession';
import { Button } from '../components/ui/Button';
import { ConfirmInline } from '../components/ui/ConfirmInline';
import '../components/question-sets/question-sets.css';
import '../components/question-sets/question-set-practice.css';

export function QuestionSetPractice() {
  const { courseId = '', setId = '', attemptId = '' } = useParams();
  const { session, error } = useQuestionSetAttempt(courseId, setId, attemptId);
  if (error)
    return (
      <p role="alert" className="p-8">
        {error}
      </p>
    );
  if (!session) return <p className="p-8">Loading attempt…</p>;
  return <PracticeWorkspace key={attemptId} session={session} />;
}

function PracticeWorkspace({ session }: { session: QuestionSetAttemptSession }) {
  const [formDirty, setFormDirty] = useState(false);
  const [reflectionDirty, setReflectionDirty] = useState(false);
  const progress = useAttemptProgress(session, formDirty || reflectionDirty);
  const attempt = progress.record;
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = rootRef.current?.closest('main');
    if (!scroller) return;
    const key = `question-set-scroll:${session.snapshot.record.id}`;
    const saved = Number(sessionStorage.getItem(key) ?? 0);
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = saved;
    });
    const save = () => sessionStorage.setItem(key, String(scroller.scrollTop));
    scroller.addEventListener('scroll', save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', save);
    };
  }, [session]);
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const allNodes = flattenQuestionSet(attempt.receipt);
  const nodes = allNodes.filter((node) => node.node.answer);
  const index = nodes.findIndex((node) => node.id === attempt.activeNodeId);
  const active = nodes[index];
  const answer = active.node.answer!;
  const questionId = active.parentIds[0] ?? active.id;
  const marking = feedbackAvailable(attempt, questionId);
  const criteria = nodes.flatMap((node) =>
    feedbackAvailable(attempt, node.parentIds[0] ?? node.id)
      ? node.node.answer!.allocations.map((allocation) => ({ nodeId: node.id, allocation }))
      : [],
  );
  const criterion =
    criteria.find((row) => row.allocation.id === attempt.activeAllocationId) ??
    criteria.find((row) => row.nodeId === active.id);
  const criterionIndex = criteria.findIndex(
    (row) => row.allocation.id === criterion?.allocation.id,
  );
  const summary = summariseSelfMarking(attempt.receipt, attempt.decisions);
  const lastPosition = useRef(`${attempt.activeNodeId}:${attempt.activeAllocationId ?? ''}`);
  useEffect(() => {
    const position = `${attempt.activeNodeId}:${attempt.activeAllocationId ?? ''}`;
    if (lastPosition.current === position) return;
    lastPosition.current = position;
    const paper = rootRef.current?.querySelector<HTMLElement>('.qs-paper');
    paper?.scrollIntoView?.({ block: 'start' });
    paper?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [attempt.activeNodeId, attempt.activeAllocationId]);
  const busy = progress.pending > 0;
  const base = `/course/${attempt.courseId}/question-sets/${attempt.questionSetId}`;
  const value = progress.value(active.id);
  const blocked = formDirty || reflectionDirty || busy || acting || Boolean(progress.error);
  async function perform(work: () => Promise<unknown>) {
    setActionError('');
    setActing(true);
    try {
      await work();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not save this change.');
    } finally {
      setActing(false);
    }
  }
  function move(nodeId: string, allocationId: string | null = null) {
    if (formDirty || reflectionDirty) {
      setActionError('Save or cancel your note or correction first.');
      return;
    }
    void perform(() =>
      progress.run((current) =>
        saveQuestionSetAttemptPosition(current.id, current.revisionId, nodeId, allocationId),
      ),
    );
    setConfirmBlank(false);
  }
  function updateMarking(
    change: (current: QuestionSetAttemptRecord) => Partial<SaveQuestionSetMarkingInput>,
  ) {
    void perform(() =>
      progress.run((current) =>
        saveQuestionSetMarking(current.id, current.revisionId, {
          decisions: current.decisions,
          annotations: current.annotations,
          corrections: current.corrections,
          reflection: current.reflection,
          activeNodeId: current.activeNodeId,
          activeAllocationId: current.activeAllocationId,
          ...change(current),
        }),
      ),
    );
  }
  async function submit(confirmed = false) {
    await progress.flush();
    const current = session.snapshot.record;
    const group =
      current.mode === 'paper'
        ? nodes
        : nodes.filter((node) => (node.parentIds[0] ?? node.id) === questionId);
    const hasBlank = group.some((node) => {
      const response = current.responses.find((row) => row.nodeId === node.id)!.draft;
      return response.kind === 'multiple-choice'
        ? !response.selectedOptionIds.length
        : !response.text.trim();
    });
    if (hasBlank && !confirmed) {
      setConfirmBlank(true);
      return;
    }
    const submitted = await progress.run((row) =>
      row.mode === 'paper'
        ? submitQuestionSetPaper(row.id, row.revisionId)
        : submitPracticeQuestion(row.id, row.revisionId, questionId),
    );
    const first = group[0];
    await progress.run(() =>
      saveQuestionSetAttemptPosition(
        submitted.id,
        submitted.revisionId,
        first.id,
        first.node.answer!.allocations[0].id,
      ),
    );
    setConfirmBlank(false);
  }
  return (
    <div className="qs-practice" ref={rootRef}>
      <header className="qs-practice-header">
        <div>
          <Link className="qs-back" to={base}>
            ← {attempt.receipt.title}
          </Link>
          <p className="qs-kicker">
            {attempt.mode === 'paper' ? 'Paper' : 'Practice'} ·{' '}
            {attempt.status === 'complete' ? 'Complete' : marking ? 'Self-marking' : 'Answering'}
          </p>
        </div>
        <div className="qs-actions">
          <span className="qs-status" role="status">
            {progress.error ? 'Not saved' : progress.dirty || progress.saving ? 'Saving…' : 'Saved'}
          </span>
          <Button
            variant="ghost"
            disabled={formDirty || reflectionDirty}
            onClick={() =>
              void perform(async () => {
                await progress.flush();
                await navigate(base);
              })
            }
          >
            {attempt.status === 'complete' ? 'Back to set' : 'Save and finish later'}
          </Button>
        </div>
      </header>
      {(progress.error || actionError) && (
        <div className="qs-error" role="alert">
          {progress.error?.message ?? actionError}
          {progress.error &&
            !(progress.error instanceof QuestionSetAttemptRevisionConflictError) && (
              <Button variant="ghost" onClick={() => void perform(progress.retry)}>
                Retry save
              </Button>
            )}
          {progress.error instanceof QuestionSetAttemptRevisionConflictError && (
            <p>Another tab changed this attempt. Copy any unsaved text before reloading.</p>
          )}
        </div>
      )}
      {progress.blocker.state === 'blocked' && (formDirty || reflectionDirty || progress.error) && (
        <div className="qs-error" role="alert">
          Save or cancel your unfinished changes before leaving.
          <Button
            variant="ghost"
            onClick={() => progress.blocker.state === 'blocked' && progress.blocker.reset()}
          >
            Stay here
          </Button>
        </div>
      )}
      <div className="qs-practice-progress">
        <span>
          {marking
            ? `Criterion ${criterionIndex + 1} of ${criteria.length}`
            : `Part ${index + 1} of ${nodes.length}`}
        </span>
        <details>
          <summary>All parts</summary>
          <nav className="qs-outline" aria-label="Question parts">
            {nodes.map((node) => (
              <button
                key={node.id}
                disabled={blocked}
                aria-current={node.id === active.id ? 'true' : undefined}
                onClick={() => move(node.id)}
              >
                {[
                  ...node.parentIds.map((id) => allNodes.find((row) => row.id === id)!.label),
                  node.label,
                ].join(' ')}
                {attempt.responses.find((row) => row.nodeId === node.id)?.submitted
                  ? ' · submitted'
                  : ''}
              </button>
            ))}
          </nav>
        </details>
      </div>
      <article className={`qs-paper ${marking ? 'qs-paper-marking' : ''}`}>
        {marking ? (
          <>
            <header className="qs-part-bar">
              <h2 tabIndex={-1}>
                {[
                  ...active.parentIds.map((id) => allNodes.find((row) => row.id === id)!.label),
                  active.label,
                ].join(' ')}
              </h2>
              <span className="qs-muted">
                {answer.maxMarks} {answer.maxMarks === 1 ? 'mark' : 'marks'}
              </span>
            </header>
            <details className="qs-question-context">
              <summary>Question and source</summary>
              <QuestionSetAnswer
                content={attempt.receipt}
                nodeId={active.id}
                value={value.kind === 'multiple-choice' ? value.selectedOptionIds : value.text}
                onChange={() => {}}
                readOnly
              />
            </details>
            {criterion && (
              <QuestionSetMarking
                key={active.id}
                attempt={attempt}
                nodeId={active.id}
                allocation={criterion.allocation}
                busy={busy || Boolean(progress.error)}
                onDraftChange={setFormDirty}
                onDecision={(decision) =>
                  updateMarking((current) => ({
                    decisions: [
                      ...current.decisions.filter(
                        (row) => row.allocationId !== criterion.allocation.id,
                      ),
                      ...(decision ? [decision] : []),
                    ],
                  }))
                }
                onAnnotation={(annotation) =>
                  updateMarking((current) => ({
                    annotations: [...current.annotations, annotation],
                  }))
                }
                onRemoveAnnotation={(id) =>
                  updateMarking((current) => ({
                    annotations: current.annotations.filter((row) => row.id !== id),
                  }))
                }
                onCorrection={(content) =>
                  updateMarking((current) => ({
                    corrections: [
                      ...current.corrections.filter((row) => row.nodeId !== active.id),
                      { nodeId: active.id, content, updatedAt: Date.now() },
                    ],
                  }))
                }
              />
            )}
          </>
        ) : (
          <QuestionSetAnswer
            content={attempt.receipt}
            nodeId={active.id}
            readOnly={acting}
            value={value.kind === 'multiple-choice' ? value.selectedOptionIds : value.text}
            onChange={(next) =>
              progress.edit(
                active.id,
                answer.response.kind === 'multiple-choice'
                  ? { kind: 'multiple-choice', selectedOptionIds: next as string[] }
                  : { kind: answer.response.kind, text: next as string },
              )
            }
          />
        )}
        <QuestionSetRelatedKnowledge
          key={active.id}
          courseId={attempt.courseId}
          conceptIds={[
            ...answer.prerequisiteConceptIds,
            ...answer.allocations.flatMap((row) => row.targetConceptIds),
          ]}
          submitted={marking}
          beforeReveal={() =>
            progress.run((current) =>
              recordQuestionSetAssistance(current.id, current.revisionId, {
                nodeId: active.id,
                kind: 'related-knowledge',
                occurredAt: Date.now(),
              }),
            )
          }
        />
        <nav className="qs-preview-nav" aria-label={marking ? 'Marking criteria' : 'Answer parts'}>
          <Button
            variant="secondary"
            disabled={blocked || (marking ? criterionIndex <= 0 : index === 0)}
            onClick={() =>
              marking
                ? move(
                    criteria[criterionIndex - 1].nodeId,
                    criteria[criterionIndex - 1].allocation.id,
                  )
                : move(nodes[index - 1].id)
            }
          >
            {marking ? 'Previous criterion' : 'Previous'}
          </Button>
          <Button
            variant="secondary"
            disabled={
              blocked ||
              (marking ? criterionIndex >= criteria.length - 1 : index >= nodes.length - 1)
            }
            onClick={() =>
              marking
                ? move(
                    criteria[criterionIndex + 1].nodeId,
                    criteria[criterionIndex + 1].allocation.id,
                  )
                : move(nodes[index + 1].id)
            }
          >
            {marking ? 'Next criterion' : 'Next'}
          </Button>
        </nav>
      </article>
      <footer className="qs-attempt-footer">
        {!marking ? (
          <>
            <p className="qs-muted">
              {attempt.mode === 'paper'
                ? 'The mark scheme opens after you submit the paper.'
                : 'Submit all parts of this question before opening its mark scheme.'}
            </p>
            {confirmBlank ? (
              <ConfirmInline
                message="Some parts are unanswered."
                confirmLabel="Submit unanswered"
                variant="default"
                focusOnMount="cancel"
                onCancel={() => setConfirmBlank(false)}
                onConfirm={() => void perform(() => submit(true))}
              />
            ) : (
              <Button
                variant="primary"
                disabled={blocked}
                onClick={() => void perform(() => submit())}
              >
                {attempt.mode === 'paper' ? 'Submit paper' : 'Submit question'}
              </Button>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="qs-result">
                {attempt.decisions.some((row) => row.status === 'awarded')
                  ? summary.total.awarded
                  : '—'}{' '}
                / {summary.total.available}{' '}
                <span>self-marked{summary.status === 'provisional' ? ' · provisional' : ''}</span>
              </p>
              {summary.status === 'provisional' && (
                <p className="qs-muted">
                  {summary.unmarkedCount + summary.unsureCount} criteria remaining
                </p>
              )}
            </div>
            {attempt.status === 'answering' ? (
              <Button
                variant="primary"
                disabled={blocked}
                onClick={() => {
                  const next = nodes.find(
                    (node) => !feedbackAvailable(attempt, node.parentIds[0] ?? node.id),
                  );
                  if (next) move(next.id);
                }}
              >
                Next question
              </Button>
            ) : attempt.status === 'complete' ? (
              <Link className="qs-back" to={base}>
                Back to set →
              </Link>
            ) : (
              <Button
                variant="primary"
                disabled={blocked || summary.status !== 'complete'}
                onClick={() =>
                  void perform(() =>
                    progress.run((current) =>
                      completeQuestionSetAttempt(current.id, current.revisionId),
                    ),
                  )
                }
              >
                Finish attempt
              </Button>
            )}
          </>
        )}
      </footer>
      {marking && (
        <QuestionSetReflection
          value={attempt.reflection}
          busy={busy || Boolean(progress.error)}
          onDirty={setReflectionDirty}
          onChange={(reflection) => updateMarking(() => ({ reflection }))}
        />
      )}
    </div>
  );
}
