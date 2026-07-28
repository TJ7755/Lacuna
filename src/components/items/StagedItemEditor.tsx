import { useState } from 'react';
import type { NumericAnswerSpec } from '../../db/types';
import type { BatchCandidate } from '../../items/batchStaging';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { MarkSchemeEditor } from './MarkSchemeEditor';
import { NumericAnswerEditor } from './NumericAnswerEditor';

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
  const [answer, setAnswer] = useState<NumericAnswerSpec>(() => numericAnswerFrom(raw?.answer));
  const [scheme, setScheme] = useState(typeof raw?.scheme === 'string' ? raw.scheme : '');
  const [fixtures, setFixtures] = useState<FixtureDraft[]>(() => fixturesFrom(raw?.fixtures));

  function apply() {
    const edited =
      kind === 'numeric'
        ? { kind, question, answer }
        : {
            kind,
            question,
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
        <label className="flex flex-col gap-2 text-sm text-ink-soft">
          Question
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <fieldset>
          <legend className="mb-2 text-sm text-ink-soft">Item type</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink/5 p-1">
            {(['numeric', 'working'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={cn(
                  'min-h-11 rounded-md px-3 text-sm capitalize transition-colors',
                  kind === option
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-soft hover:text-ink',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {kind === 'numeric' ? (
        <NumericAnswerEditor value={answer} onChange={setAnswer} />
      ) : (
        <>
          <MarkSchemeEditor value={scheme} onChange={setScheme} />
          <FixtureEditor fixtures={fixtures} onChange={setFixtures} />
        </>
      )}

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
    <section
      className="rounded-2xl border border-line bg-surface p-5 md:p-6"
      aria-labelledby="staged-fixtures-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="staged-fixtures-heading" className="font-display text-xl text-ink">
            Validation fixtures
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Sample answers that guard the mark scheme against regressions.
          </p>
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
            <div key={fixture.id} className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
                <label className="flex flex-col gap-2 text-sm text-ink-soft">
                  Sample answer {index + 1}
                  <textarea
                    value={fixture.studentAnswer}
                    onChange={(event) => update(index, { studentAnswer: event.target.value })}
                    rows={4}
                    placeholder="One working step per line"
                    className="resize-y rounded-xl border border-line-strong bg-paper px-4 py-3 font-mono text-sm leading-6 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-ink-soft">
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
                    className="min-h-11 rounded-xl border border-line-strong bg-paper px-3 font-mono text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm text-ink-soft">
                  <span className="sr-only">Fixture {index + 1} note</span>
                  <input
                    value={fixture.note}
                    onChange={(event) => update(index, { note: event.target.value })}
                    placeholder="Optional note"
                    className="min-h-11 w-full rounded-xl border border-line-strong bg-paper px-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
    </section>
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
