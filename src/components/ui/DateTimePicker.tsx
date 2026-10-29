import { scaledSpring } from './motion';
import { calendarKeyboardDate } from './calendarKeyboardDate';
import { buttonClassName } from './buttonStyles';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m as motion } from 'motion/react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from './icons';
import { fieldLabelClassName } from './Field';
import { cn } from './cn';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAnchoredPopoverPosition } from '../../hooks/useAnchoredPopoverPosition';
import { fromDateTimeLocalValue, getComponentsInZone } from '../../utils/datetime';
import {
  MONTHS,
  buildMonth,
  pad,
  resolveAdjacentMonth,
  shiftMonth,
  type CalendarView,
} from './dateTimeCalendar';
import { useDateTimeDraft } from './useDateTimeDraft';
import {
  renderDaysCalendar,
  renderMonthsCalendar,
  renderYearsCalendar,
} from './DateTimeCalendarViews';

interface DateTimePickerProps {
  value: number;
  onChange: (epochMs: number) => void;
  onValidityChange?: (valid: boolean) => void;
  label?: string;
  /** Keep the label as the trigger's accessible name only, where a row already names it. */
  hideLabel?: boolean;
  timeZone?: string;
  appearance?: 'field' | 'chip';
}

type PickerMode = 'days' | 'months' | 'years';

interface PendingGridFocus {
  mode: PickerMode;
  index: number | null;
}

export function DateTimePicker({
  value,
  onChange,
  onValidityChange,
  label,
  hideLabel = false,
  timeZone,
  appearance = 'field',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const {
    placement,
    position: popoverPosition,
    resetPosition: resetPopoverPosition,
  } = useAnchoredPopoverPosition(open, triggerRef, dropdownRef);
  const popoverReady = popoverPosition !== null;
  const dayRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const monthRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const yearRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingGridFocusRef = useRef<PendingGridFocus | null>(null);
  const latestValueRef = useRef(value);
  const labelId = useId();
  const [motionSpeed] = useMotionSpeed();
  const m = speedMultiplier(motionSpeed);

  const selected = useMemo(() => getComponentsInZone(value, timeZone), [value, timeZone]);

  // A calendar month is not an instant. Keeping it as year/month avoids invalid
  // midnight values in time zones whose daylight-saving transition skips midnight.
  const [view, setView] = useState<CalendarView>(() => ({
    year: selected.year,
    month: selected.month,
  }));
  // Direction for month slide animation: -1 = prev, 1 = next
  const [slideDir, setSlideDir] = useState(0);
  // Month/year picker mode
  const [pickerMode, setPickerMode] = useState<PickerMode>('days');
  // Keyboard focus: index into the cells array
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [monthFocusIndex, setMonthFocusIndex] = useState(0);
  const [yearFocusIndex, setYearFocusIndex] = useState(4);
  const {
    hourDraft,
    setHourDraft,
    minuteDraft,
    setMinuteDraft,
    validationError,
    setValidationError,
    reportValidity,
    commitTimeDrafts,
  } = useDateTimeDraft(selected, latestValueRef, onChange, onValidityChange, timeZone);
  useFocusTrap(open, { autoFocusSelector: '[aria-current="date"], [tabindex="0"]' }, dropdownRef);

  useLayoutEffect(() => {
    if (!open || !popoverReady) return;
    dropdownRef.current
      ?.querySelector<HTMLElement>('[aria-current="date"], [tabindex="0"]')
      ?.focus();
  }, [open, popoverReady]);

  // Extract selected-date components in the target time zone
  const selectedDay = selected.day;
  const selectedMonth = selected.month;
  const selectedYear = selected.year;
  const hours = selected.hours;
  const minutes = selected.minutes;

  const year = view.year;
  const month = view.month;

  const cells = useMemo(() => buildMonth(year, month), [year, month]);
  const yearRange = useMemo(() => {
    const start = year - 4;
    return Array.from({ length: 9 }, (_, i) => start + i);
  }, [year]);

  // Extract "today" components in the target time zone
  const today = useMemo(() => getComponentsInZone(Date.now(), timeZone), [timeZone]);
  const todayDay = today.day;
  const todayMonth = today.month;
  const todayYear = today.year;

  // Find the initial focus index (selected day or today)
  const initialFocusIndex = useMemo(() => {
    const idx = cells.findIndex(
      (c) =>
        c.currentMonth && c.day === selectedDay && month === selectedMonth && year === selectedYear,
    );
    if (idx >= 0) return idx;
    const todayIdx = cells.findIndex(
      (c) => c.currentMonth && c.day === todayDay && month === todayMonth && year === todayYear,
    );
    if (todayIdx >= 0) return todayIdx;
    const firstCurrentMonthDay = cells.findIndex((cell) => cell.currentMonth);
    return firstCurrentMonthDay >= 0 ? firstCurrentMonthDay : 0;
  }, [
    cells,
    selectedDay,
    selectedMonth,
    selectedYear,
    month,
    year,
    todayDay,
    todayMonth,
    todayYear,
  ]);

  const display = `${pad(selectedDay)} ${MONTHS[selectedMonth].slice(0, 3)} ${selectedYear} · ${pad(hours)}:${pad(minutes)}`;

  const closePicker = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const selectDay = useCallback(
    (day: number, currentMonth: boolean) => {
      const { y, m } = resolveAdjacentMonth(day, currentMonth, year, month);
      const ms = fromDateTimeLocalValue(
        `${y}-${pad(m + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}`,
        timeZone,
      );
      if (!Number.isFinite(ms)) {
        reportValidity('That local date and time does not exist. Choose another time.');
        return;
      }
      reportValidity(null);
      if (ms !== latestValueRef.current) {
        latestValueRef.current = ms;
        onChange(ms);
      }
      if (!currentMonth) {
        dayRefs.current = [];
        pendingGridFocusRef.current = { mode: 'days', index: null };
      }
      setView({ year: y, month: m });
    },
    [year, month, hours, minutes, onChange, reportValidity, timeZone],
  );

  // Date arithmetic uses UTC only as a calendar coordinate, never as the chosen instant.
  const handleDayKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const current = focusIndex ?? initialFocusIndex;
      const cell = cells[current];
      if (!cell) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectDay(cell.day, cell.currentMonth);
        return;
      }
      const { y, m } = resolveAdjacentMonth(cell.day, cell.currentMonth, year, month);
      const next = calendarKeyboardDate(y, m, cell.day, event.key, event.shiftKey);
      if (!next) return;
      event.preventDefault();
      if (next.year !== year || next.month !== month) {
        setSlideDir(next.year * 12 + next.month > year * 12 + month ? 1 : -1);
        dayRefs.current = [];
        const index = new Date(Date.UTC(next.year, next.month, 1)).getUTCDay() + next.day - 1;
        pendingGridFocusRef.current = { mode: 'days', index };
        setView({ year: next.year, month: next.month });
      } else {
        const index = cells.findIndex(
          (candidate) => candidate.currentMonth && candidate.day === next.day,
        );
        setFocusIndex(index);
        dayRefs.current[index]?.focus();
      }
    },
    [cells, focusIndex, initialFocusIndex, month, selectDay, year],
  );

  // Outside dismissal commits a valid in-progress time. Invalid drafts keep the
  // picker open so the error is visible instead of being silently discarded.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current ||
        containerRef.current.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      if (commitTimeDrafts()) closePicker(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closePicker(true);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closePicker, commitTimeDrafts, open]);

  const enterMode = useCallback(
    (mode: PickerMode) => {
      if (mode === 'days') {
        dayRefs.current = [];
        pendingGridFocusRef.current = { mode: 'days', index: null };
      } else if (mode === 'months') {
        monthRefs.current = [];
        setMonthFocusIndex(month);
        pendingGridFocusRef.current = { mode: 'months', index: month };
      } else {
        yearRefs.current = [];
        const currentYearIndex = yearRange.indexOf(year);
        const nextIndex = currentYearIndex >= 0 ? currentYearIndex : 4;
        setYearFocusIndex(nextIndex);
        pendingGridFocusRef.current = { mode: 'years', index: nextIndex };
      }
      setPickerMode(mode);
    },
    [month, year, yearRange],
  );

  const selectMonth = useCallback(
    (index: number) => {
      setView({ year, month: index });
      enterMode('days');
    },
    [enterMode, year],
  );

  const selectYear = useCallback(
    (index: number) => {
      const selectedViewYear = yearRange[index];
      if (selectedViewYear === undefined) return;
      setView({ year: selectedViewYear, month });
      enterMode('months');
    },
    [enterMode, month, yearRange],
  );

  const handleMonthKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = monthFocusIndex;
      switch (e.key) {
        case 'ArrowLeft':
          next -= 1;
          break;
        case 'ArrowRight':
          next += 1;
          break;
        case 'ArrowUp':
          next -= 3;
          break;
        case 'ArrowDown':
          next += 3;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          selectMonth(monthFocusIndex);
          return;
        default:
          return;
      }
      e.preventDefault();
      next = Math.max(0, Math.min(11, next));
      setMonthFocusIndex(next);
      monthRefs.current[next]?.focus();
    },
    [monthFocusIndex, selectMonth],
  );

  const handleYearKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = yearFocusIndex;
      switch (e.key) {
        case 'ArrowLeft':
          next -= 1;
          break;
        case 'ArrowRight':
          next += 1;
          break;
        case 'ArrowUp':
          next -= 3;
          break;
        case 'ArrowDown':
          next += 3;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          selectYear(yearFocusIndex);
          return;
        default:
          return;
      }
      e.preventDefault();
      next = Math.max(0, Math.min(yearRange.length - 1, next));
      setYearFocusIndex(next);
      yearRefs.current[next]?.focus();
    },
    [selectYear, yearFocusIndex, yearRange.length],
  );

  // Keep the editable fields in sync when a date, quick action or external value changes.
  useEffect(() => {
    latestValueRef.current = value;
    setHourDraft(pad(selected.hours));
    setMinuteDraft(pad(selected.minutes));
  }, [selected.hours, selected.minutes, value, setHourDraft, setMinuteDraft]);

  useLayoutEffect(() => {
    if (!open || pickerMode !== 'days' || pendingGridFocusRef.current?.mode !== 'days') return;
    const next = pendingGridFocusRef.current.index ?? initialFocusIndex;
    setFocusIndex(next);
    const element = dayRefs.current[next];
    if (element?.isConnected) {
      pendingGridFocusRef.current = null;
      element.focus();
    } else {
      pendingGridFocusRef.current = { mode: 'days', index: next };
    }
  }, [cells, initialFocusIndex, open, pickerMode]);

  useEffect(() => {
    const pending = pendingGridFocusRef.current;
    if (!open || !pending || pending.mode !== pickerMode || pending.index === null) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    const focusWhenMounted = () => {
      if (cancelled) return;
      const currentPending = pendingGridFocusRef.current;
      if (currentPending?.mode !== pickerMode || currentPending.index === null) return;
      const refs = pickerMode === 'days' ? dayRefs : pickerMode === 'months' ? monthRefs : yearRefs;
      const element = refs.current[currentPending.index];
      if (element?.isConnected) {
        pendingGridFocusRef.current = null;
        element.focus();
        return;
      }
      timeoutId = window.setTimeout(focusWhenMounted, 16);
    };
    focusWhenMounted();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [focusIndex, monthFocusIndex, open, pickerMode, yearFocusIndex, year, month]);

  // Reset slide direction after animation completes
  useEffect(() => {
    if (slideDir !== 0) {
      const id = window.setTimeout(() => setSlideDir(0), 300);
      return () => window.clearTimeout(id);
    }
  }, [slideDir, year, month]);

  const headerStep = pickerMode === 'days' ? 1 : pickerMode === 'months' ? 1 : 9;
  const headerUnit =
    pickerMode === 'days' ? 'month' : pickerMode === 'months' ? 'year' : 'nine years';
  const headerText =
    pickerMode === 'days'
      ? `${MONTHS[month]} ${year}`
      : pickerMode === 'months'
        ? String(year)
        : `${yearRange[0]}–${yearRange[yearRange.length - 1]}`;

  const navigateHeader = (direction: -1 | 1) => {
    setSlideDir(direction);
    if (pickerMode === 'days') {
      dayRefs.current = [];
      setView((currentView) => shiftMonth(currentView, direction));
    } else {
      setView((currentView) => ({
        ...currentView,
        year: currentView.year + direction * headerStep,
      }));
    }
  };

  const popoverHost =
    typeof document === 'undefined'
      ? null
      : (containerRef.current?.closest('[role="dialog"]')?.parentElement ?? document.body);

  return (
    <div ref={containerRef} className="relative" data-date-time-picker>
      {label && (
        <span id={labelId} className={hideLabel ? 'sr-only' : `mb-2 ${fieldLabelClassName}`}>
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            if (commitTimeDrafts()) closePicker(true);
            return;
          }
          setView({ year: selectedYear, month: selectedMonth });
          setPickerMode('days');
          setSlideDir(0);
          setHourDraft(pad(selected.hours));
          setMinuteDraft(pad(selected.minutes));
          reportValidity(null);
          dayRefs.current = [];
          pendingGridFocusRef.current = { mode: 'days', index: null };
          resetPopoverPosition();
          setOpen(true);
        }}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Choose date and time'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={validationError ? 'true' : undefined}
        onFocus={() => {
          if (open && validationError) {
            dropdownRef.current?.querySelector<HTMLInputElement>('[aria-label="Hour"]')?.focus();
          }
        }}
        className={cn(
          // The text input's frame (Field's inputFrameClassName), with the accent while open.
          appearance === 'chip'
            ? 'path-editor-chip'
            : 'flex w-full items-center gap-3 rounded-xl border-[1.5px] bg-surface px-3.5 py-2.5 text-left text-sm text-ink outline-none transition-colors focus-visible:border-accent',
          appearance === 'field' && (open ? 'border-accent' : 'border-line'),
        )}
      >
        {appearance === 'field' && (
          <CalendarIcon width={16} height={16} className="shrink-0 text-ink-faint" />
        )}
        <span className="tabular">{display}</span>
      </button>

      {popoverHost &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={dropdownRef}
                role="dialog"
                aria-label="Choose date and time"
                data-date-time-picker-popover
                onKeyDown={(event) => {
                  if (event.key === 'Tab') return;
                  event.stopPropagation();
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  if (commitTimeDrafts()) closePicker(true);
                }}
                style={{
                  top: popoverPosition?.top ?? 0,
                  left: popoverPosition?.left ?? 0,
                  visibility: popoverPosition ? 'visible' : 'hidden',
                }}
                initial={
                  m > 0
                    ? {
                        opacity: 0,
                        y: appearance === 'chip' ? 0 : placement === 'bottom' ? -6 : 6,
                        scale: appearance === 'chip' ? 0.94 : 0.97,
                      }
                    : false
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  m > 0
                    ? { opacity: 0, y: placement === 'bottom' ? -6 : 6, scale: 0.97 }
                    : undefined
                }
                transition={
                  appearance === 'chip'
                    ? scaledSpring(m, 520, 34)
                    : { duration: 0.12 * m, ease: [0.16, 1, 0.3, 1] }
                }
                className="fixed z-[60] max-h-[calc(100vh-2rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border border-line-strong bg-surface card-surface"
              >
                {/* Header: month navigation */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerMode === 'days') enterMode('months');
                      else if (pickerMode === 'months') enterMode('years');
                      else enterMode('months');
                    }}
                    className="flex min-h-11 items-center justify-start rounded-full px-3 py-1 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/5 active:bg-ink/5"
                    aria-label={
                      pickerMode === 'days'
                        ? 'Open month selector'
                        : pickerMode === 'months'
                          ? 'Open year selector'
                          : 'Return to month selector'
                    }
                  >
                    {headerText}
                  </button>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => navigateHeader(-1)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink"
                      aria-label={`Previous ${headerUnit}`}
                    >
                      <ChevronLeftIcon width={16} height={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateHeader(1)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink"
                      aria-label={`Next ${headerUnit}`}
                    >
                      <ChevronRightIcon width={16} height={16} />
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {pickerMode === 'days' &&
                    renderDaysCalendar({
                      year,
                      month,
                      slideDir,
                      m,
                      handleDayKeyDown,
                      cells,
                      selectedDay,
                      selectedMonth,
                      selectedYear,
                      todayDay,
                      todayMonth,
                      todayYear,
                      focusIndex,
                      dayRefs,
                      setFocusIndex,
                      selectDay,
                    })}

                  {pickerMode === 'months' &&
                    renderMonthsCalendar({
                      m,
                      year,
                      handleMonthKeyDown,
                      month,
                      selectedMonth,
                      selectedYear,
                      monthRefs,
                      monthFocusIndex,
                      setMonthFocusIndex,
                      selectMonth,
                    })}

                  {pickerMode === 'years' &&
                    renderYearsCalendar({
                      m,
                      yearRange,
                      handleYearKeyDown,
                      year,
                      selectedYear,
                      yearRefs,
                      yearFocusIndex,
                      setYearFocusIndex,
                      selectYear,
                    })}
                </AnimatePresence>

                {/* Time selector */}
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink-soft">
                      <ClockIcon width={13} height={13} />
                      Time
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Hour"
                        maxLength={2}
                        value={hourDraft}
                        aria-invalid={validationError ? 'true' : undefined}
                        onChange={(e) => {
                          if (/^\d{0,2}$/.test(e.target.value)) setHourDraft(e.target.value);
                          setValidationError(null);
                          onValidityChange?.(false);
                        }}
                        onBlur={() => {
                          commitTimeDrafts();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitTimeDrafts();
                          }
                        }}
                        className="h-11 w-14 rounded-xl border-[1.5px] border-line bg-surface text-center text-sm text-ink outline-none focus:border-accent-ink tabular"
                      />
                      <span className="text-ink-faint">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Minute"
                        maxLength={2}
                        value={minuteDraft}
                        aria-invalid={validationError ? 'true' : undefined}
                        onChange={(e) => {
                          if (/^\d{0,2}$/.test(e.target.value)) setMinuteDraft(e.target.value);
                          setValidationError(null);
                          onValidityChange?.(false);
                        }}
                        onBlur={() => {
                          commitTimeDrafts();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitTimeDrafts();
                          }
                        }}
                        className="h-11 w-14 rounded-xl border-[1.5px] border-line bg-surface text-center text-sm text-ink outline-none focus:border-accent-ink tabular"
                      />
                    </div>
                  </div>
                  {validationError && (
                    <p role="alert" className="mt-2 text-xs text-negative">
                      {validationError}
                    </p>
                  )}
                </div>

                {/* Footer: quick actions */}
                <div className="flex items-center justify-between border-t border-line px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = Date.now();
                      const nowComponents = getComponentsInZone(now, timeZone);
                      const ms = fromDateTimeLocalValue(
                        `${nowComponents.year}-${pad(nowComponents.month + 1)}-${pad(nowComponents.day)}T${pad(hours)}:${pad(minutes)}`,
                        timeZone,
                      );
                      if (!Number.isFinite(ms)) return;
                      reportValidity(null);
                      onChange(ms);
                      setView({ year: nowComponents.year, month: nowComponents.month });
                    }}
                    className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-ink/5"
                  >
                    Jump to today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (commitTimeDrafts()) closePicker(true);
                    }}
                    className={buttonClassName('primary', 'sm')}
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          popoverHost,
        )}
    </div>
  );
}
