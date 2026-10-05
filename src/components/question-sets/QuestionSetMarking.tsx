import { QuestionSetPanel } from './QuestionSetPanel';
import { QuestionSetChoices } from './QuestionSetChoices';
import { useRef, useState } from 'react';
import type {
  QuestionSetAttemptRecord,
  QuestionSetAttemptAnnotation,
} from '../../questions/questionSetAttempts';
import type { MarkAllocation, SelfMarkDecision } from '../../questions/questionSets';
import { MarkdownView } from '../markdown/MarkdownView';
import { Button } from '../ui/Button';
import { sourceAnchorFromSelection } from '../notes/noteAnchors';
import { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import { dimensionNames } from './presentation';

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
  const root = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ start: number; end: number } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const savedCorrection = attempt.corrections.find((row) => row.nodeId === nodeId)?.content ?? '';
  const [correction, setCorrection] = useState(savedCorrection);
  const decision = attempt.decisions.find((row) => row.allocationId === allocation.id);
  const annotations = attempt.annotations.filter((row) => row.nodeId === nodeId);
  const boundaries = [
    ...new Set([
      0,
      text.length,
      ...annotations.flatMap((row) => (row.start === undefined ? [] : [row.start, row.end!])),
    ]),
  ].sort((a, b) => a - b);
  function addNote(highlight: boolean) {
    setSelectionError('');
    if (highlight) {
      const result = sourceAnchorFromSelection(root.current!, text, window.getSelection());
      if (!result.anchor) {
        setSelectionError(result.error);
        return;
      }
      setAnchor({ start: result.anchor.startOffset, end: result.anchor.endOffset });
    } else setAnchor(null);
    setNote('');
  }
  return (
    <div className="qs-marking-grid">
      <section>
        <p className="qs-kicker">Original answer</p>
        {response.kind === 'multiple-choice' && format.kind === 'multiple-choice' && (
          <div className="qs-original select-text">
            {response.selectedOptionIds.length ? (
              format.options
                .filter((option) => response.selectedOptionIds.includes(option.id))
                .map((option) => (
                  <MarkdownView enlargeImages key={option.id} source={option.content} />
                ))
            ) : (
              <p>No answer submitted.</p>
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
                : 'No answer submitted.'}
            </p>
          </div>
        )}
        <div className="qs-actions">
          {text && (
            <Button variant="ghost" onClick={() => addNote(true)}>
              Highlight and comment
            </Button>
          )}
          <Button variant="ghost" onClick={() => addNote(false)}>
            Add note
          </Button>
        </div>
        {selectionError && (
          <p role="status" className="qs-muted">
            {selectionError}
          </p>
        )}
        {note !== null && (
          <div>
            {anchor && (
              <blockquote className="qs-muted">{text.slice(anchor.start, anchor.end)}</blockquote>
            )}
            <label className="qs-field">
              Note
              <textarea
                autoFocus
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  onDraftChange(true);
                }}
              />
            </label>
            <div className="qs-actions">
              <Button
                disabled={!note.trim() || busy}
                onClick={() => {
                  onAnnotation({
                    id: crypto.randomUUID(),
                    nodeId,
                    ...anchor,
                    comment: note.trim(),
                    createdAt: Date.now(),
                  });
                  setNote(null);
                  onDraftChange(correction !== savedCorrection);
                }}
              >
                Save note
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNote(null);
                  onDraftChange(correction !== savedCorrection);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {annotations.map((row) => (
          <div className="qs-answer-note" key={row.id}>
            {row.start !== undefined && <blockquote>{text.slice(row.start, row.end)}</blockquote>}
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
        ))}
        <QuestionSetPanel title="Correction" className="qs-correction">
          <label className="qs-field">
            Correction
            <textarea
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
              }}
            >
              Cancel correction
            </Button>
          )}
        </QuestionSetPanel>
      </section>
      <section className="qs-marking-criterion">
        <p className="qs-kicker">Mark scheme · {dimensionNames[allocation.dimension]}</p>
        <MarkdownView enlargeImages source={allocation.criterion} />
        {allocation.explanation && (
          <QuestionSetPanel title="Explanation" className="qs-correction">
            <MarkdownView enlargeImages source={allocation.explanation} />
          </QuestionSetPanel>
        )}
        <QuestionSetChoices
          label="Marks awarded"
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
            })),
            { value: 'unsure', label: 'Unsure' },
          ]}
        />
        <p className="qs-muted">
          Self-marked{decision?.status === 'unsure' ? ' · needs another look' : ''}
        </p>
      </section>
    </div>
  );
}
