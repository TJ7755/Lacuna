import type { NumericAnswerSpec } from '../../db/types';
import { parseExpression } from '../../items/verify';
import { MathsAnswerInput } from './MathsAnswerInput';
import { cn } from '../ui/cn';

interface NumericAnswerEditorProps {
  value: NumericAnswerSpec;
  onChange: (value: NumericAnswerSpec) => void;
  invalid?: boolean;
}

const ANSWER_KINDS = [
  { kind: 'exact' as const, label: 'Exact' },
  { kind: 'within' as const, label: 'Tolerance' },
  { kind: 'matches-one-of' as const, label: 'One of' },
];

function expressionIsConstant(source: string): boolean {
  const parsed = parseExpression(source);
  return parsed.ok && parsed.expression.variables.length === 0;
}

export function numericAnswerSpecIsValid(spec: NumericAnswerSpec): boolean {
  if (spec.kind === 'matches-one-of') {
    return spec.values.length > 0 && spec.values.every(expressionIsConstant);
  }
  if (!expressionIsConstant(spec.value)) return false;
  return spec.kind === 'exact' || (Number.isFinite(spec.tolerance) && spec.tolerance >= 0);
}

function firstValue(spec: NumericAnswerSpec): string {
  return spec.kind === 'matches-one-of' ? (spec.values[0] ?? '') : spec.value;
}

export function NumericAnswerEditor({ value, onChange, invalid = false }: NumericAnswerEditorProps) {
  const selectKind = (kind: NumericAnswerSpec['kind']) => {
    const current = firstValue(value);
    if (kind === 'exact') onChange({ kind, value: current });
    else if (kind === 'within') onChange({ kind, value: current, tolerance: 0.01 });
    else onChange({ kind, values: value.kind === kind ? value.values : [current] });
  };

  const updateMatch = (index: number, next: string) => {
    if (value.kind !== 'matches-one-of') return;
    const values = value.values.map((candidate, candidateIndex) =>
      candidateIndex === index ? next : candidate,
    );
    onChange({ ...value, values });
  };

  return (
    <section
      className={cn(
        'rounded-xl border bg-paper p-4 transition-colors md:p-5',
        invalid ? 'border-negative' : 'border-line',
      )}
      aria-labelledby="numeric-answer-heading"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="numeric-answer-heading" className="text-sm font-medium text-ink">
            Accepted answer
          </h2>
          <p className="mt-1 text-sm text-ink-faint">Choose how strictly Lacuna should check it.</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink/5 p-1" role="group" aria-label="Answer check">
          {ANSWER_KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={value.kind === option.kind}
              onClick={() => selectKind(option.kind)}
              className={cn(
                'min-h-11 rounded-md px-3 text-sm transition-colors',
                value.kind === option.kind
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {value.kind === 'matches-one-of' ? (
        <div className="space-y-4">
          {value.values.map((candidate, index) => (
            <div key={index} className="relative">
              <MathsAnswerInput
                label={`Accepted answer ${index + 1}`}
                value={candidate}
                onChange={(next) => updateMatch(index, next)}
              />
              {value.values.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...value, values: value.values.filter((_, i) => i !== index) })
                  }
                  className="mt-2 min-h-11 rounded-lg px-3 text-sm text-negative transition-colors hover:bg-negative/10"
                >
                  Remove answer
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, values: [...value.values, ''] })}
            className="min-h-11 rounded-lg border border-line-strong px-4 text-sm text-ink-soft transition-colors hover:border-accent/60 hover:text-accent"
          >
            Add accepted answer
          </button>
        </div>
      ) : (
        <div className={cn(value.kind === 'within' && 'grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]')}>
          <MathsAnswerInput
            label="Expected answer"
            value={value.value}
            onChange={(next) => onChange({ ...value, value: next })}
          />
          {value.kind === 'within' && (
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-ink-faint">
                Plus or minus
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={Number.isFinite(value.tolerance) ? value.tolerance : ''}
                onChange={(event) => {
                  const raw = event.target.value;
                  onChange({ ...value, tolerance: raw === '' ? Number.NaN : Number(raw) });
                }}
                className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 font-mono text-base text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          )}
        </div>
      )}

      {!numericAnswerSpecIsValid(value) && (
        <p className="mt-3 text-sm text-negative">
          Enter at least one valid numeric answer without variables.
        </p>
      )}
    </section>
  );
}
