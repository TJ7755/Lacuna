import { fieldLabelClassName } from '../ui/Field';
import type { Ref } from 'react';
import type { CourseSchedulingMode } from '@lacuna/core/db/types';
import { DateTimePicker } from '../ui/DateTimePicker';
import { cn } from '../ui/cn';
import { CalendarIcon, CheckIcon, InfinityIcon } from '../ui/icons';

const TARGETS = [
  { value: 'exam', label: 'Exam date', detail: 'Work towards a deadline', Icon: CalendarIcon },
  {
    value: 'steady',
    label: 'Steady retention',
    detail: 'Keep it fresh long term',
    Icon: InfinityIcon,
  },
] as const;

/** The two study targets as selectable tiles; shared by new courses and final assessments. */
export function StudyTargetTiles({
  name,
  value,
  onChange,
  disabled,
  wording,
}: {
  name: string;
  value: CourseSchedulingMode | null | undefined;
  onChange: (mode: CourseSchedulingMode) => void;
  disabled?: boolean;
  /** Replaces the label and detail of each tile, for places that avoid scheduling terms. */
  wording?: Record<CourseSchedulingMode, { label: string; detail: string }>;
}) {
  return (
    <div className="study-target-tiles grid gap-2">
      {TARGETS.map((target) => {
        const { value: mode, Icon } = target;
        const { label, detail } = wording?.[mode] ?? target;
        const selected = value === mode;
        return (
          <label
            key={mode}
            className={cn(
              'relative flex cursor-pointer flex-col gap-2 rounded-2xl px-4 py-3.5 transition-[background-color,box-shadow] duration-150',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-ink',
              selected
                ? 'bg-accent-soft shadow-[inset_0_0_0_2px_hsl(var(--ink))]'
                : 'bg-ink/[0.04] hover:bg-ink/[0.07]',
            )}
          >
            <input
              type="radio"
              name={name}
              value={mode}
              checked={selected}
              onChange={() => onChange(mode)}
              disabled={disabled}
              className="sr-only"
            />
            <span className="flex items-center justify-between">
              <Icon width={18} height={18} className={selected ? 'text-ink' : 'text-ink-soft'} />
              <span
                aria-hidden
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full bg-ink text-paper transition-transform duration-150',
                  selected ? 'scale-100' : 'scale-0',
                )}
              >
                <CheckIcon width={12} height={12} />
              </span>
            </span>
            <span className="text-sm font-semibold text-ink">{label}</span>
            <span className="-mt-1.5 text-xs text-ink-soft">{detail}</span>
          </label>
        );
      })}
    </div>
  );
}

export function CourseStudyTarget({
  schedulingMode,
  setSchedulingMode,
  saving,
  datePickerRef,
  examDate,
  setExamDate,
  setExamDateValid,
  timeZone,
}: {
  schedulingMode: CourseSchedulingMode | null;
  setSchedulingMode: (mode: CourseSchedulingMode) => void;
  saving?: boolean;
  datePickerRef?: Ref<HTMLDivElement>;
  examDate: number;
  setExamDate: (date: number) => void;
  setExamDateValid: (valid: boolean) => void;
  timeZone: string;
}) {
  return (
    <>
      <fieldset>
        <legend className={`mb-2 ${fieldLabelClassName}`}>Study target</legend>
        <StudyTargetTiles
          name="course-scheduling-mode"
          value={schedulingMode}
          onChange={setSchedulingMode}
          disabled={saving}
        />
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
