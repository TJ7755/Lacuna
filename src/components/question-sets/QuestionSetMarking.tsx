import { QuestionSetPanel } from './QuestionSetPanel';
import { QuestionSetChoices } from './QuestionSetChoices';
import { useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import type {
  QuestionSetAttemptRecord,
  QuestionSetAttemptAnnotation,
} from '../../questions/questionSetAttempts';
import type { MarkAllocation, SelfMarkDecision } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import { sourceAnchorFromSelection } from '../notes/noteAnchors';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import { EditIcon, PlusIcon, SparklesIcon } from '../ui/icons';
import { collapse } from '../ui/motion';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { JEV_JUDGING_MS, useJevAllocationMarking } from '../../jev';

export function QuestionSetMarking({
  attempt,
  nodeId,
  allocation,
  busy,
  onDecision,
  onAnnotation,
  onRemoveAnnotation,
  onCorrection,
  onDraftChange,
}: {
  attempt: QuestionSetAttemptRecord;
  nodeId: string;
  allocation: MarkAllocation;
  busy: boolean;
  onDecision: (decision: SelfMarkDecision | null) => void;
  onAnnotation: (annotation: QuestionSetAttemptAnnotation) => void;
  onRemoveAnnotation: (id: string) => void;
  onCorrection: (text: string) => void;
  onDraftChange: (dirty: boolean) => void;
}) {
  const response = attempt.responses.find((row) => row.nodeId === nodeId)!.submitted!;
  const text = response.kind === 'multiple-choice' ? '' : response.text;
  const format = flattenQuestionSet(attempt.receipt).find((node) => node.id === nodeId)!.node
    .answer!.response;
  const [motionSpeed] = useMotionSpeed();
  const disclosure = collapse(speedMultiplier(motionSpeed));
  const root = useRef<HTMLDivElement>(null);
  const correctionInput = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ start: number; end: number } | null>(null);
  const savedCorrection = attempt.corrections.find((row) => row.nodeId === nodeId)?.content ?? '';
  const [correction, setCorrection] = useState(savedCorrection);
  const decision = attempt.decisions.find((row) => row.allocationId === allocation.id);
  const multiplier = speedMultiplier(motionSpeed);
  const jev = useJevAllocationMarking(
    attempt.id,
    attempt.status === 'complete' ? undefined : allocation.id,
    JEV_JUDGING_MS * Math.max(multiplier, 0.3),
  );
  const pending = jev.state === 'marking' && !decision;
  const automatic = decision?.status === 'awarded' ? decision.markedBy : undefined;
  // Only a verdict the learner watched arrive is revealed; revisits show it at rest.
  const [watched, setWatched] = useState<string | null>(null);
  if (pending && watched !== allocation.id) setWatched(allocation.id);
  if (!pending && watched !== null && watched !== allocation.id) setWatched(null);
  const revealing = watched === allocation.id && multiplier > 0;
  const status = pending
    ? 'Marking this answer automatically…'
    : decision
      ? automatic && watched === allocation.id && decision.status === 'awarded'
        ? `Marked automatically: ${decision.marks} of ${allocation.maxMarks}.`
        : ''
      : jev.state === 'failed'
        ? 'Automatic marking could not be saved. Choose a mark.'
        : jev.state === 'left'
          ? 'Automatic marking was not sure enough. Choose a mark.'
          : jev.state === 'unavailable'
            ? 'Automatic marking is paused. Choose a mark.'
            : '';
  const annotations = attempt.annotations.filter((row) => row.nodeId === nodeId);
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...annotations.flatMap((row) => (row.start === undefined ? [] : [row.start, row.end!])),
    ]),
  ].sort((a, b) => a - b);
  /** Text selected in the answer when the note opens becomes the note's highlight. */
  function startNote() {
    const selection = window.getSelection();
    const result =
      text && selection && !selection.isCollapsed && root.current?.contains(selection.anchorNode)
        ? sourceAnchorFromSelection(root.current, text, selection).anchor
        : undefined;
    setAnchor(result ? { start: result.startOffset, end: result.endOffset } : null);
    setNote('');
  }
  function endNote(close: () => void) {
    setNote(null);
    onDraftChange(correction !== savedCorrection);
    close();
  }
  return (
    <div className="qs-marking-grid">
      <section className="qs-marking-criterion" aria-describedby={`qs-question-${nodeId}`}>
        <MarkdownView enlargeImages source={allocation.criterion} />
        {allocation.explanation && (
          <QuestionSetPanel
            title="Explanation"
            className="qs-correction"
            panelClassName="qs-practice-panel"
          >
            <MarkdownView enlargeImages source={allocation.explanation} />
          </QuestionSetPanel>
        )}
        <QuestionSetChoices
          key={allocation.id}
          label="Marks awarded"
          flow
          pending={pending}
          accentValues={(value) => value !== '' && value !== 'unsure'}
          describedBy={`qs-question-${nodeId}`}
          value={
            decision?.status === 'awarded'
              ? String(decision.marks)
              : decision?.status === 'unsure'
                ? 'unsure'
                : ''
          }
          disabled={busy || attempt.status === 'complete'}
          onChange={(value) => {
            onDecision(
              value === ''
                ? null
                : value === 'unsure'
                  ? { allocationId: allocation.id, status: 'unsure' }
                  : { allocationId: allocation.id, status: 'awarded', marks: Number(value) },
            );
          }}
          options={[
            { value: '', label: 'Not marked' },
            ...Array.from({ length: allocation.maxMarks + 1 }, (_, marks) => ({
              value: String(marks),
              label: `${marks} / ${allocation.maxMarks}`,
              description: automatic &&
                decision?.status === 'awarded' &&
                decision.marks === marks && (
                  <motion.span
                    className="qs-choice-jev"
                    title={`Marked automatically (${Math.round(automatic.confidence * 100)}% sure). Choose another mark to override it.`}
                    initial={revealing ? { opacity: 0, scale: 0.4 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.24 * multiplier, delay: 0.22 * multiplier }}
                  >
                    <SparklesIcon width={14} height={14} aria-hidden="true" />
                    <span className="sr-only">, marked automatically</span>
                  </motion.span>
                ),
            })),
            { value: 'unsure', label: 'Unsure' },
          ]}
        />
        <p
          aria-live="polite"
          className={
            !decision &&
            (jev.state === 'left' || jev.state === 'unavailable' || jev.state === 'failed')
              ? 'qs-muted'
              : 'sr-only'
          }
        >
          {status}
        </p>
      </section>
      <section className="qs-marking-answer">
        <div className="qs-answer-frame">
          {response.kind === 'multiple-choice' && format.kind === 'multiple-choice' && (
            <div className="qs-original select-text">
              {response.selectedOptionIds.length ? (
                format.options
                  .filter((option) => response.selectedOptionIds.includes(option.id))
                  .map((option) => (
                    <MarkdownView enlargeImages key={option.id} source={option.content} />
                  ))
              ) : (
                <p>Unanswered</p>
              )}
            </div>
          )}
          {response.kind !== 'multiple-choice' && (
            <div
              ref={root}
              className="qs-original select-text"
              tabIndex={0}
              aria-label="Original answer"
            >
              <p>
                {text
                  ? boundaries.slice(0, -1).map((start, index) => {
                      const end = boundaries[index + 1];
                      const highlighted = annotations.some(
                        (row) => row.start !== undefined && row.start <= start && row.end! >= end,
                      );
                      return highlighted ? (
                        <mark key={start}>{text.slice(start, end)}</mark>
                      ) : (
                        <span key={start}>{text.slice(start, end)}</span>
                      );
                    })
                  : 'Unanswered'}
              </p>
            </div>
          )}
          <div className="qs-answer-tools">
            <QuestionSetPanel
              title="Add note"
              icon={<PlusIcon width={18} height={18} />}
              panelClassName="qs-practice-panel"
              canClose={!note?.trim()}
              onOpen={startNote}
            >
              {(close) => (
                <>
                  {anchor && (
                    <blockquote className="qs-note-quote">
                      {text.slice(anchor.start, anchor.end)}
                    </blockquote>
                  )}
                  <label className="qs-field">
                    <span className="sr-only">Note</span>
                    <textarea
                      rows={4}
                      value={note ?? ''}
                      onChange={(event) => {
                        setNote(event.target.value);
                        onDraftChange(
                          Boolean(event.target.value.trim()) || correction !== savedCorrection,
                        );
                      }}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    disabled={!note?.trim() || busy}
                    onClick={() => {
                      onAnnotation({
                        id: crypto.randomUUID(),
                        nodeId,
                        ...anchor,
                        comment: note!.trim(),
                        createdAt: Date.now(),
                      });
                      endNote(close);
                    }}
                  >
                    Save note
                  </Button>
                  <Button variant="ghost" onClick={() => endNote(close)}>
                    Cancel
                  </Button>
                </>
              )}
            </QuestionSetPanel>
            <QuestionSetPanel
              title="Correction"
              icon={<EditIcon width={18} height={18} />}
              panelClassName="qs-practice-panel"
              canClose={correction === savedCorrection}
            >
              <label className="qs-field">
                <span className="sr-only">Correction</span>
                <textarea
                  ref={correctionInput}
                  rows={5}
                  value={correction}
                  onChange={(event) => {
                    setCorrection(event.target.value);
                    onDraftChange(event.target.value !== savedCorrection || Boolean(note?.trim()));
                  }}
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy || correction === savedCorrection}
                onClick={() => {
                  onCorrection(correction);
                  onDraftChange(Boolean(note?.trim()));
                  correctionInput.current?.focus();
                }}
              >
                Save correction
              </Button>
              {correction !== savedCorrection && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCorrection(savedCorrection);
                    onDraftChange(Boolean(note?.trim()));
                    correctionInput.current?.focus();
                  }}
                >
                  Cancel correction
                </Button>
              )}
            </QuestionSetPanel>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {annotations.map((row) => (
            <motion.div className="qs-answer-note-row" key={row.id} {...disclosure}>
              <div className="qs-answer-note">
                {row.start !== undefined && (
                  <blockquote>{text.slice(row.start, row.end)}</blockquote>
                )}
                <p>{row.comment}</p>
                <button
                  className="qs-back"
                  disabled={busy}
                  onClick={() => onRemoveAnnotation(row.id)}
                  aria-label={`Remove note: ${row.comment}`}
                >
                  Remove
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </section>
    </div>
  );
}
