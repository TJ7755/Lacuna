import { useCallback, useState, type RefObject } from 'react';
import { fromDateTimeLocalValue, type getComponentsInZone } from '../../utils/datetime';
import { pad } from './dateTimeCalendar';

export function useDateTimeDraft(
  selected: ReturnType<typeof getComponentsInZone>,
  latestValueRef: RefObject<number>,
  onChange: (epochMs: number) => void,
  onValidityChange: ((valid: boolean) => void) | undefined,
  timeZone: string | undefined,
) {
  const selectedYear = selected.year;
  const selectedMonth = selected.month;
  const selectedDay = selected.day;
  const [hourDraft, setHourDraft] = useState(() => pad(selected.hours));
  const [minuteDraft, setMinuteDraft] = useState(() => pad(selected.minutes));
  const [validationError, setValidationError] = useState<string | null>(null);
  const reportValidity = useCallback(
    (error: string | null) => {
      setValidationError(error);
      onValidityChange?.(error === null);
    },
    [onValidityChange],
  );

  const setTime = useCallback(
    (h: number, m: number) => {
      const ms = fromDateTimeLocalValue(
        `${selectedYear}-${pad(selectedMonth + 1)}-${pad(selectedDay)}T${pad(h)}:${pad(m)}`,
        timeZone,
      );
      if (!Number.isFinite(ms)) {
        reportValidity('That local date and time does not exist. Choose another time.');
        return false;
      }
      reportValidity(null);
      if (ms !== latestValueRef.current) {
        latestValueRef.current = ms;
        onChange(ms);
      }
      return true;
    },
    [selectedYear, selectedMonth, selectedDay, onChange, reportValidity, timeZone, latestValueRef],
  );

  const commitTimeDrafts = useCallback(() => {
    const h = /^\d{1,2}$/.test(hourDraft) ? Number(hourDraft) : Number.NaN;
    const min = /^\d{1,2}$/.test(minuteDraft) ? Number(minuteDraft) : Number.NaN;
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) {
      reportValidity('Enter a valid 24-hour time.');
      return false;
    }
    const committed = setTime(h, min);
    if (committed) {
      setHourDraft(pad(h));
      setMinuteDraft(pad(min));
    }
    return committed;
  }, [hourDraft, minuteDraft, reportValidity, setTime]);

  return {
    hourDraft,
    setHourDraft,
    minuteDraft,
    setMinuteDraft,
    validationError,
    setValidationError,
    reportValidity,
    commitTimeDrafts,
  };
}
