import { useMemo, useState } from 'react';
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
        {marks.available ? `${marks.earned} / ${marks.available}` : 'No submitted answers'}
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
}: {
  content: QuestionSetRecord;
  attempts: QuestionSetAttemptRecord[];
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
  if (!evidence?.all.attempts) return null;
  const selected =
    partition === 'first'
      ? evidence.firstRecorded
      : partition === 'repeated'
        ? evidence.repeated
        : evidence.all;
  const dimensions = [
    ['knowledge', 'Knowledge'],
    ['application', 'Application'],
    ['exam-execution', 'Exam execution'],
    ['mixed', 'Mixed'],
  ] as const;
  return (
    <details className="qs-history">
      <summary className="qs-back">Practice evidence</summary>
      <div className="mt-6 space-y-6">
        <label className="qs-field max-w-sm">
          Attempts
          <select
            value={partition}
            onChange={(event) => setPartition(event.target.value as typeof partition)}
          >
            <option value="all">All attempts</option>
            <option value="first">First recorded</option>
            <option value="repeated">Repeated</option>
          </select>
        </label>
        <p className="qs-muted">
          Self-marked · {selected.attempts} {selected.attempts === 1 ? 'attempt' : 'attempts'} ·{' '}
          {selected.assisted} assisted
        </p>
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
          Submitted answers only. Unresolved marks are not zero. Repeated attempts are practice
          evidence, not an exam forecast.
        </p>
      </div>
    </details>
  );
}
