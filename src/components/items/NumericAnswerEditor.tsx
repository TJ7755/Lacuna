import type { Ref } from 'react';
import { Button } from '../ui/Button';
import type { NumericAnswerSpec } from '../../db/types';
import { numericAnswerSpecIsValid } from '../../items/numericAnswerSpec';
import { MathsAnswerInput } from './MathsAnswerInput';
import { cn } from '../ui/cn';
import { fieldLabelClassName, inputFrameClassName } from '../ui/Field';
import { PillToggleGroup } from '../cards/PillToggleGroup';
import { StepSwap } from '../ui/StepSwap';
import { MeasuredHeight } from '../ui/MeasuredHeight';

interface NumericAnswerEditorProps {
  value: NumericAnswerSpec;
  onChange: (value: NumericAnswerSpec) => void;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onTabForward?: () => void;
  onTabBackward?: () => void;
}

const ANSWER_KINDS = [
  { value: 'exact' as const, label: 'Exact' },
  { value: 'within' as const, label: 'Tolerance' },
  { value: 'matches-one-of' as const, label: 'One of' },
];

export { numericAnswerSpecIsValid } from '../../items/numericAnswerSpec';

function firstValue(spec: NumericAnswerSpec): string {
  return spec.kind === 'matches-one-of' ? (spec.values[0] ?? '') : spec.value;
}

export function NumericAnswerEditor({
  value,
  onChange,
  invalid = false,
  inputRef,
  onTabForward,
  onTabBackward,
}: NumericAnswerEditorProps) {
  const invalidAlternative =
    value.kind === 'matches-one-of'
      ? value.values.findIndex(
          (candidate) => !numericAnswerSpecIsValid({ kind: 'exact', value: candidate }),
        )
      : -1;
  const focusTolerance =
    invalid &&
    value.kind === 'within' &&
    numericAnswerSpecIsValid({ kind: 'exact', value: value.value }) &&
    !numericAnswerSpecIsValid(value);
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
        'rounded-3xl border bg-surface p-5 md:p-6',
        invalid ? 'border-negative' : 'border-line',
      )}
      aria-labelledby="numeric-answer-heading"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="numeric-answer-heading" className={fieldLabelClassName}>
            Accepted answer
          </h2>
        </div>
        <PillToggleGroup
          label="Answer check"
          options={ANSWER_KINDS}
          value={value.kind}
          onChange={selectKind}
          size="sm"
        />
      </div>

      <MeasuredHeight>
        <StepSwap stepKey={value.kind}>
          {value.kind === 'matches-one-of' ? (
            <div className="space-y-4">
              {value.values.map((candidate, index) => (
                <div key={index} className="relative">
                  <MathsAnswerInput
                    ref={
                      index === (invalid && invalidAlternative >= 0 ? invalidAlternative : 0)
                        ? inputRef
                        : undefined
                    }
                    onTabForward={onTabForward}
                    onTabBackward={onTabBackward}
                    label={`Accepted answer ${index + 1}`}
                    value={candidate}
                    onChange={(next) => updateMatch(index, next)}
                  />
                  {value.values.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        onChange({ ...value, values: value.values.filter((_, i) => i !== index) })
                      }
                      className="mt-2"
                    >
                      Remove answer
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => onChange({ ...value, values: [...value.values, ''] })}
              >
                Add accepted answer
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                value.kind === 'within' &&
                  'grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_9rem]',
              )}
            >
              <MathsAnswerInput
                ref={focusTolerance ? undefined : inputRef}
                onTabForward={onTabForward}
                onTabBackward={onTabBackward}
                label="Expected answer"
                value={value.value}
                onChange={(next) => onChange({ ...value, value: next })}
              />
              {value.kind === 'within' && (
                <label className="block">
                  <span className={`${fieldLabelClassName} mb-2`}>Plus or minus</span>
                  <input
                    ref={focusTolerance ? inputRef : undefined}
                    type="number"
                    aria-label="Plus or minus"
                    min="0"
                    step="any"
                    value={Number.isFinite(value.tolerance) ? value.tolerance : ''}
                    onChange={(event) => {
                      const raw = event.target.value;
                      onChange({ ...value, tolerance: raw === '' ? Number.NaN : Number(raw) });
                    }}
                    className={`${inputFrameClassName} min-h-11 w-full font-mono text-base`}
                  />
                </label>
              )}
            </div>
          )}
        </StepSwap>
      </MeasuredHeight>

      {!numericAnswerSpecIsValid(value) && (
        <p className="mt-3 text-sm text-negative">
          Enter at least one valid numeric answer without variables.
        </p>
      )}
    </section>
  );
}
