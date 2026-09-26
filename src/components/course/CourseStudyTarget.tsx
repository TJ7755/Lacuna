import type { Ref } from 'react';
import type { CourseSchedulingMode } from '../../db/types';
import { DateTimePicker } from '../ui/DateTimePicker';
import { cn } from '../ui/cn';

export function CourseStudyTarget({
  schedulingMode,
  setSchedulingMode,
  targetError,
  setTargetError,
  saving,
  targetRef,
  datePickerRef,
  examDate,
  setExamDate,
  setExamDateValid,
  timeZone,
}: {
  schedulingMode: CourseSchedulingMode | null;
  setSchedulingMode: (mode: CourseSchedulingMode) => void;
  targetError?: string | null;
  setTargetError?: (error: string | null) => void;
  saving?: boolean;
  targetRef?: Ref<HTMLFieldSetElement>;
  datePickerRef?: Ref<HTMLDivElement>;
  examDate: number;
  setExamDate: (date: number) => void;
  setExamDateValid: (valid: boolean) => void;
  timeZone: string;
}) {
  return (
    <>
      <fieldset ref={targetRef} aria-describedby={targetError ? 'course-target-error' : undefined}>
        <legend className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-faint">
          Study target
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['exam', 'Exam date', 'Schedule towards a deadline.'],
              ['steady', 'Steady retention', 'Keep knowledge available long term.'],
            ] as const
          ).map(([value, label, description]) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-xl border px-3 py-3 transition-colors',
                schedulingMode === value
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="radio"
                  name="course-scheduling-mode"
                  value={value}
                  checked={schedulingMode === value}
                  onChange={() => {
                    setSchedulingMode(value);
                    setTargetError?.(null);
                  }}
                  disabled={saving}
                />
                {label}
              </span>
              <span className="mt-1 block pl-6 text-xs leading-relaxed text-ink-faint">
                {description}
              </span>
            </label>
          ))}
        </div>
        {targetError && (
          <p id="course-target-error" role="alert" className="mt-2 text-sm text-negative">
            {targetError}
          </p>
        )}
      </fieldset>

      {schedulingMode === 'exam' && (
        <div ref={datePickerRef}>
          <DateTimePicker
            value={examDate}
            onChange={setExamDate}
            onValidityChange={setExamDateValid}
            timeZone={timeZone}
            label="Exam date and time"
          />
        </div>
      )}
    </>
  );
}
