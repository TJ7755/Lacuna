import { useMemo, useState } from 'react';
import { PillToggleGroup } from '../cards/PillToggleGroup';
import { ContentDisclosure } from '../ui/ContentDisclosure';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { StepSwap } from '../ui/StepSwap';
import type { QuestionSetRecord } from '../../questions/questionSetCodec';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import {
  summariseQuestionSetEvidence,
  type EvidenceMarks,
} from '../../questions/questionSetEvidence';

const PARTITIONS = [
  { value: 'all', label: 'All' },
  { value: 'first', label: 'First recorded' },
  { value: 'repeated', label: 'Repeated' },
] as const;
const DIMENSIONS = [
  ['knowledge', 'Knowledge'],
  ['application', 'Application'],
  ['exam-execution', 'Exam execution'],
  ['mixed', 'Mixed'],
] as const;

function Marks({ marks }: { marks: EvidenceMarks }) {
  return (
    <>
      <span className="tabular-nums">
        {!marks.available
          ? 'No submitted answers'
          : marks.available === marks.unresolvedAvailable
            ? 'Not marked yet'
            : `${marks.earned} / ${marks.available - marks.unresolvedAvailable}`}
      </span>
      {marks.unresolvedAvailable > 0 && (
        <span className="mt-1 block text-xs font-normal text-ink-faint">
          {marks.unresolvedAvailable} {marks.unresolvedAvailable === 1 ? 'mark' : 'marks'}{' '}
          unresolved
        </span>
      )}
    </>
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
  if (!evidence || !evidence.all.attempts) return null;
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
  const evidenceKey = JSON.stringify([partition, selected.marks, selected.dimensions, coverage]);
  return (
    <div className="space-y-2 border-t border-line pt-5">
      <section aria-labelledby="recorded-marks-heading">
        <h3 id="recorded-marks-heading" className="mb-1 text-sm font-normal text-ink-soft">
          Recorded marks
        </h3>
        <AnimatedDisclosure open retainContent fade={false}>
          <StepSwap stepKey={evidenceKey}>
            <div
              className={
                selected.marks.available
                  ? 'font-display text-[22px] font-semibold tabular-nums'
                  : 'text-sm text-ink-faint'
              }
            >
              <Marks marks={selected.marks} />
            </div>
            {evidence.repeated.attempts > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                {partition === 'first'
                  ? 'First recorded attempts'
                  : partition === 'repeated'
                    ? 'Repeated attempts'
                    : 'All attempts'}
              </p>
            )}
          </StepSwap>
        </AnimatedDisclosure>
      </section>
      {(evidence.all.marks.available > 0 || targetCount > 0) && (
        <ContentDisclosure label="Evidence details" className="-mx-3">
          <div className="space-y-4 px-3 pb-1 pt-3">
            {evidence.repeated.attempts > 0 && (
              <PillToggleGroup
                label="Evidence attempts"
                size="sm"
                options={PARTITIONS}
                value={partition}
                onChange={setPartition}
              />
            )}
            <StepSwap stepKey={evidenceKey} className="space-y-4">
              <dl className="space-y-3 text-sm">
                {DIMENSIONS.filter(([id]) => selected.dimensions[id].available > 0).map(
                  ([id, label]) => (
                    <div className="flex justify-between gap-3" key={id}>
                      <dt className="text-ink-soft">{label}</dt>
                      <dd className="text-right">
                        <Marks marks={selected.dimensions[id]} />
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              {targetCount > 0 && (
                <p className="text-sm text-ink-faint">
                  {coverage.markedConceptIds.length} of {targetCount} skills assessed
                </p>
              )}
            </StepSwap>
          </div>
        </ContentDisclosure>
      )}
    </div>
  );
}
