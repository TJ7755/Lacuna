import { QuestionSetPanel } from './QuestionSetPanel';
import { QuestionSetChoices } from './QuestionSetChoices';
import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import {
  summariseQuestionSetEvidence,
  type EvidenceMarks,
} from '../../questions/questionSetEvidence';

function Marks({ marks }: { marks: EvidenceMarks }) {
  return (
    <div>
      <span className="tabular-nums">
        {!marks.available
          ? 'No submitted answers'
          : marks.available === marks.unresolvedAvailable
            ? 'Not marked yet'
            : `${marks.earned} / ${marks.available - marks.unresolvedAvailable}`}
      </span>
      {marks.unresolvedAvailable > 0 && (
        <p className="qs-muted mt-1">
          {marks.unresolvedAvailable} {marks.unresolvedAvailable === 1 ? 'mark' : 'marks'}{' '}
          unresolved
        </p>
      )}
    </div>
  );
}

export function QuestionSetEvidencePanel({
  content,
  attempts,
  onResume,
}: {
  content: QuestionSetRecord;
  attempts: QuestionSetAttemptRecord[];
  onResume?: (attempt: QuestionSetAttemptRecord) => void;
}) {
  const [partition, setPartition] = useState<'all' | 'first' | 'repeated'>('all');
  const evidence = useMemo(
    () =>
      summariseQuestionSetEvidence({
        courseId: content.courseId,
        currentSets: [content],
        attempts: attempts.filter((attempt) => attempt.questionSetId === content.id),
      }).sets[0],
    [content, attempts],
  );
  if (!evidence) return null;
  const selected =
    partition === 'first'
      ? evidence.firstRecorded
      : partition === 'repeated'
        ? evidence.repeated
        : evidence.all;
  const coverage = selected.currentTargetEvidence;
  const targetCount =
    coverage.markedConceptIds.length +
    coverage.unresolvedConceptIds.length +
    coverage.missingConceptIds.length;
  const unfinished = attempts
    .filter(
      (attempt) =>
        attempt.courseId === content.courseId &&
        attempt.questionSetId === content.id &&
        attempt.status !== 'complete',
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const dimensions = [
    ['knowledge', 'Knowledge'],
    ['application', 'Application'],
    ['exam-execution', 'Exam execution'],
    ['mixed', 'Mixed'],
  ] as const;
  return (
    <QuestionSetPanel title="Practice evidence" className="qs-history">
      <div className="mt-6 space-y-6">
        <QuestionSetChoices
          label="Attempts"
          value={partition}
          onChange={(value) => setPartition(value as typeof partition)}
          options={[
            { value: 'all', label: 'All attempts' },
            { value: 'first', label: 'First recorded' },
            { value: 'repeated', label: 'Repeated' },
          ]}
        />
        <p className="qs-muted">
          Self-marked · {selected.attempts} {selected.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
          {selected.assisted} assisted
        </p>
        <section className="border-b border-line pb-4" aria-label="Current concept coverage">
          <h3 className="mb-2 text-sm font-medium">Current concept coverage</h3>
          {targetCount ? (
            <>
              <p>
                {coverage.markedConceptIds.length} of {targetCount} linked concepts have marked
                evidence.
              </p>
              {!coverage.markedConceptIds.length && (
                <p className="qs-muted mt-2">No marked evidence yet.</p>
              )}
              {coverage.unresolvedConceptIds.length > 0 && (
                <p className="qs-muted mt-2">
                  {coverage.unresolvedConceptIds.length} awaiting marking
                </p>
              )}
              {coverage.missingConceptIds.length > 0 && (
                <p className="qs-muted mt-2">
                  {coverage.missingConceptIds.length} without submitted evidence
                </p>
              )}
              <p className="qs-muted mt-2">
                Coverage records which concepts have been assessed, not mastery. Changed questions
                need fresh evidence.
              </p>
            </>
          ) : (
            <p className="qs-muted">No concepts linked. Concept coverage is unknown.</p>
          )}
        </section>
        <p className="qs-muted">
          {selected.completed} complete · {selected.provisional} marking · {selected.answering}{' '}
          answering
        </p>
        {unfinished && onResume && partition === 'all' && (
          <div>
            <p className="qs-muted mb-2">
              {unfinished.status === 'marking'
                ? 'Finish marking your submitted answers to resolve the remaining marks.'
                : 'Continue your unfinished attempt before starting another.'}
            </p>
            <Button variant="secondary" onClick={() => onResume(unfinished)}>
              {unfinished.status === 'marking' ? 'Continue marking' : 'Resume attempt'}
            </Button>
          </div>
        )}
        <div className="border-b border-line pb-4">
          <h3 className="mb-2 text-sm font-medium">Recorded marks</h3>
          <Marks marks={selected.marks} />
        </div>
        <dl className="space-y-4">
          {dimensions
            .filter(([id]) => id !== 'mixed' || selected.dimensions.mixed.available > 0)
            .map(([id, label]) => (
              <div className="flex flex-wrap justify-between gap-3" key={id}>
                <dt>{label}</dt>
                <dd className="text-right">
                  <Marks marks={selected.dimensions[id]} />
                </dd>
              </div>
            ))}
        </dl>
        <p className="qs-muted">
          Submitted answers only. Totals include resolved marks; unresolved marks are not zero.
          Repeated attempts are practice evidence, not an exam forecast.
        </p>
      </div>
    </QuestionSetPanel>
  );
}
