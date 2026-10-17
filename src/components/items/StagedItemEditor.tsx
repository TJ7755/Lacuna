import { PillToggleGroup } from '../cards/PillToggleGroup';
import { MeasuredHeight } from '../ui/MeasuredHeight';
import { StepSwap } from '../ui/StepSwap';
import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { useState } from 'react';
import type { NumericAnswerSpec } from '../../db/types';
import type { BatchCandidate } from '../../items/batchStaging';
import { Button } from '../ui/Button';
import { MarkSchemeEditor } from './MarkSchemeEditor';
import { NumericAnswerEditor } from './NumericAnswerEditor';
import { SectionCard } from '../ui/SectionCard';

interface StagedItemEditorProps {
  candidate: BatchCandidate;
  onApply: (sourceJson: string) => void;
  onCancel: () => void;
}

interface FixtureDraft {
  id: string;
  studentAnswer: string;
  expectedMarks: number;
  note: string;
}

export function StagedItemEditor({ candidate, onApply, onCancel }: StagedItemEditorProps) {
  const raw = asRecord(candidate.raw);
  const [kind, setKind] = useState<'numeric' | 'working'>(candidate.kind ?? 'numeric');
  const [question, setQuestion] = useState(
    typeof raw?.question === 'string' ? raw.question : candidate.question,
  );
  const [explanation, setExplanation] = useState(
    typeof raw?.explanation === 'string' ? raw.explanation : candidate.explanation,
  );
  const [targetConcept, setTargetConcept] = useState(
    typeof raw?.targetConcept === 'string' ? raw.targetConcept : candidate.targetConcept,
  );
  const [prerequisiteConcepts, setPrerequisiteConcepts] = useState(
    Array.isArray(raw?.prerequisiteConcepts)
      ? raw.prerequisiteConcepts
          .filter((value): value is string => typeof value === 'string')
          .join('\n')
      : candidate.prerequisiteConcepts.join('\n'),
  );
  const [answer, setAnswer] = useState<NumericAnswerSpec>(() => numericAnswerFrom(raw?.answer));
  const [scheme, setScheme] = useState(typeof raw?.scheme === 'string' ? raw.scheme : '');
  const [fixtures, setFixtures] = useState<FixtureDraft[]>(() => fixturesFrom(raw?.fixtures));

  function apply() {
    const edited =
      kind === 'numeric'
        ? {
            kind,
            question,
            explanation,
            targetConcept,
            prerequisiteConcepts: conceptLines(prerequisiteConcepts),
            answer,
          }
        : {
            kind,
            question,
            explanation,
            targetConcept,
            prerequisiteConcepts: conceptLines(prerequisiteConcepts),
            scheme,
            fixtures: fixtures.map((fixture) => ({
              id: fixture.id,
              studentAnswer: fixture.studentAnswer
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
              expectedMarks: fixture.expectedMarks,
              ...(fixture.note.trim() ? { note: fixture.note.trim() } : {}),
            })),
          };
    onApply(JSON.stringify(edited, null, 2));
  }

  return (
    <div className="mt-4 space-y-5 border-t border-line pt-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
          Question
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className={`${inputFrameClassName} resize-y text-sm leading-6`}
          />
        </label>
        <fieldset>
          <legend className={`${fieldLabelClassName} mb-2`}>Item type</legend>
          <PillToggleGroup
            label="Item type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'numeric', label: 'numeric' },
              { value: 'working', label: 'working' },
            ]}
          />
        </fieldset>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
          Worked explanation
          <textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            rows={4}
            className={`${inputFrameClassName} resize-y text-sm leading-6`}
          />
        </label>
        <div className="space-y-4">
          <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
            Primary target Concept
            <input
              value={targetConcept}
              onChange={(event) => setTargetConcept(event.target.value)}
              className={`${inputFrameClassName} min-h-11`}
            />
          </label>
          <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
            Prerequisite Concepts
            <textarea
              value={prerequisiteConcepts}
              onChange={(event) => setPrerequisiteConcepts(event.target.value)}
              rows={3}
              placeholder="One Concept per line"
              className={`${inputFrameClassName} resize-y placeholder:text-ink-faint`}
            />
          </label>
        </div>
      </div>

      <MeasuredHeight>
        <StepSwap stepKey={kind}>
          {kind === 'numeric' ? (
            <NumericAnswerEditor value={answer} onChange={setAnswer} />
          ) : (
            <>
              <MarkSchemeEditor value={scheme} onChange={setScheme} />
              <FixtureEditor fixtures={fixtures} onChange={setFixtures} />
            </>
          )}
        </StepSwap>
      </MeasuredHeight>

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={apply}>
          Apply edit
        </Button>
      </div>
    </div>
  );
}

function conceptLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function FixtureEditor({
  fixtures,
  onChange,
}: {
  fixtures: FixtureDraft[];
  onChange: (fixtures: FixtureDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<FixtureDraft>) => {
    onChange(
      fixtures.map((fixture, fixtureIndex) =>
        fixtureIndex === index ? { ...fixture, ...patch } : fixture,
      ),
    );
  };

  return (
    <SectionCard compact className="md:p-6" aria-labelledby="staged-fixtures-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="staged-fixtures-heading" className="font-display text-xl text-ink">
            Validation fixtures
          </h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange([...fixtures, emptyFixture(fixtures.length)])}
        >
          Add fixture
        </Button>
      </div>

      {fixtures.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-faint">
          Add at least one sample answer and the marks it should receive.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {fixtures.map((fixture, index) => (
            <div key={fixture.id} className="rounded-2xl bg-ink/[0.04] p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
                <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                  Sample answer {index + 1}
                  <textarea
                    value={fixture.studentAnswer}
                    onChange={(event) => update(index, { studentAnswer: event.target.value })}
                    rows={4}
                    placeholder="One working step per line"
                    className={`${inputFrameClassName} resize-y font-mono text-sm leading-6`}
                  />
                </label>
                <label className={`${fieldLabelClassName} flex flex-col gap-2`}>
                  Expected marks
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={Number.isFinite(fixture.expectedMarks) ? fixture.expectedMarks : ''}
                    onChange={(event) =>
                      update(index, {
                        expectedMarks:
                          event.target.value === '' ? Number.NaN : Number(event.target.value),
                      })
                    }
                    className={`${inputFrameClassName} min-h-11 font-mono`}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className={`${fieldLabelClassName} min-w-0 flex-1`}>
                  <span className="sr-only">Fixture {index + 1} note</span>
                  <input
                    value={fixture.note}
                    onChange={(event) => update(index, { note: event.target.value })}
                    placeholder="Optional note"
                    className={`${inputFrameClassName} min-h-11 w-full`}
                  />
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    onChange(fixtures.filter((_, fixtureIndex) => fixtureIndex !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function numericAnswerFrom(value: unknown): NumericAnswerSpec {
  const answer = asRecord(value);
  if (answer?.kind === 'within') {
    return {
      kind: 'within',
      value: typeof answer.value === 'string' ? answer.value : '',
      tolerance: typeof answer.tolerance === 'number' ? answer.tolerance : 0.01,
    };
  }
  if (answer?.kind === 'matches-one-of') {
    return {
      kind: 'matches-one-of',
      values: Array.isArray(answer.values)
        ? answer.values.filter((entry): entry is string => typeof entry === 'string')
        : [''],
    };
  }
  return {
    kind: 'exact',
    value: typeof answer?.value === 'string' ? answer.value : '',
  };
}

function fixturesFrom(value: unknown): FixtureDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const fixture = asRecord(entry);
    const answer = fixture?.studentAnswer;
    return {
      id: typeof fixture?.id === 'string' && fixture.id ? fixture.id : `fixture-${index + 1}`,
      studentAnswer: Array.isArray(answer)
        ? answer.filter((line): line is string => typeof line === 'string').join('\n')
        : typeof answer === 'string'
          ? answer
          : '',
      expectedMarks: typeof fixture?.expectedMarks === 'number' ? fixture.expectedMarks : 0,
      note: typeof fixture?.note === 'string' ? fixture.note : '',
    };
  });
}

function emptyFixture(index: number): FixtureDraft {
  return {
    id: `fixture-${index + 1}-${Date.now().toString(36)}`,
    studentAnswer: '',
    expectedMarks: 0,
    note: '',
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
