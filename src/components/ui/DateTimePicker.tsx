import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, CalendarIcon } from './icons';
import { cn } from './cn';
import { useMotionSpeed, speedMultiplier } from '../../state/motionSpeed';
import { getComponentsInZone, fromDateTimeLocalValue } from '../../utils/datetime';

interface DateTimePickerProps {
  value: number;
  onChange: (epochMs: number) => void;
  label?: string;
  timeZone?: string;
}

interface CalendarView {
  year: number;
  month: number;
}

const DAYS: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS: string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function shiftMonth(view: CalendarView, offset: number): CalendarView {
  const shifted = new Date(Date.UTC(view.year, view.month + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

/** Build a calendar month grid: { day: number, currentMonth: boolean }[]. */
function buildMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { day: number; currentMonth: boolean }[] = [];
  // Leading days from previous month
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, currentMonth: false });
  }
  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, currentMonth: true });
  }
  // Trailing days from next month (pad to 6 rows = 42 cells max)
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, currentMonth: false });
  }
  return cells;
}

/** Determine which month an adjacent cell belongs to. */
function resolveAdjacentMonth(
  day: number,
  currentMonth: boolean,
  year: number,
  month: number,
): { y: number; m: number } {
  if (currentMonth) return { y: year, m: month };
  if (day > 20) {
    const m = month - 1;
    return m < 0 ? { y: year - 1, m: 11 } : { y: year, m };
  }
  const m = month + 1;
  return m > 11 ? { y: year + 1, m: 0 } : { y: year, m };
}

export function DateTimePicker({ value, onChange, label, timeZone }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dayRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusCalendarRef = useRef(false);
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
  const [pickerMode, setPickerMode] = useState<'days' | 'months' | 'years'>('days');
  // Keyboard focus: index into the cells array
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [hourDraft, setHourDraft] = useState(() => pad(selected.hours));
  const [minuteDraft, setMinuteDraft] = useState(() => pad(selected.minutes));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Extract selected-date components in the target time zone
  const selectedDay = selected.day;
  const selectedMonth = selected.month;
  const selectedYear = selected.year;
  const hours = selected.hours;
  const minutes = selected.minutes;

  const year = view.year;
  const month = view.month;

  const cells = useMemo(() => buildMonth(year, month), [year, month]);

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

  // Close on Escape / click outside.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePicker(false);
      }
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
  }, [closePicker, open]);

  // Keyboard handling belongs to the day grid. Attaching it to the whole dialog
  // hijacks arrows and Enter from the month controls and time fields.
  const handleDayKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const current = focusIndex ?? initialFocusIndex;
      let next = current;

      switch (e.key) {
        case 'ArrowLeft':
          next = current - 1;
          break;
        case 'ArrowRight':
          next = current + 1;
          break;
        case 'ArrowUp':
          next = current - 7;
          break;
        case 'ArrowDown':
          next = current + 7;
          break;
        case 'Home':
          next = Math.floor(current / 7) * 7;
          break;
        case 'End':
          next = Math.min(Math.floor(current / 7) * 7 + 6, cells.length - 1);
          break;
        case 'PageUp':
          e.preventDefault();
          setSlideDir(-1);
          focusCalendarRef.current = true;
          setView((currentView) => shiftMonth(currentView, -1));
          return;
        case 'PageDown':
          e.preventDefault();
          setSlideDir(1);
          focusCalendarRef.current = true;
          setView((currentView) => shiftMonth(currentView, 1));
          return;
        default:
          return;
      }
      e.preventDefault();
      next = Math.max(0, Math.min(cells.length - 1, next));
      setFocusIndex(next);
      dayRefs.current[next]?.focus();
    },
    [cells.length, focusIndex, initialFocusIndex],
  );

  const selectDay = useCallback(
    (day: number, currentMonth: boolean) => {
      const { y, m } = resolveAdjacentMonth(day, currentMonth, year, month);
      const ms = fromDateTimeLocalValue(
        `${y}-${pad(m + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}`,
        timeZone,
      );
      if (!Number.isFinite(ms)) {
        setValidationError('That local date and time does not exist. Choose another time.');
        return;
      }
      setValidationError(null);
      onChange(ms);
      if (!currentMonth) focusCalendarRef.current = true;
      setView({ year: y, month: m });
    },
    [year, month, hours, minutes, onChange, timeZone],
  );

  const setTime = useCallback(
    (h: number, m: number) => {
      const ms = fromDateTimeLocalValue(
        `${selectedYear}-${pad(selectedMonth + 1)}-${pad(selectedDay)}T${pad(h)}:${pad(m)}`,
        timeZone,
      );
      if (!Number.isFinite(ms)) {
        setValidationError('That local date and time does not exist. Choose another time.');
        return false;
      }
      setValidationError(null);
      onChange(ms);
      return true;
    },
    [selectedYear, selectedMonth, selectedDay, onChange, timeZone],
  );

  const commitTimeDrafts = useCallback(() => {
    const h = /^\d{1,2}$/.test(hourDraft) ? Number(hourDraft) : Number.NaN;
    const min = /^\d{1,2}$/.test(minuteDraft) ? Number(minuteDraft) : Number.NaN;
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) {
      setValidationError('Enter a valid 24-hour time.');
      return false;
    }
    const committed = setTime(h, min);
    if (committed) {
      setHourDraft(pad(h));
      setMinuteDraft(pad(min));
    }
    return committed;
  }, [hourDraft, minuteDraft, setTime]);

  // Keep the editable fields in sync when a date, quick action or external value changes.
  useEffect(() => {
    setHourDraft(pad(selected.hours));
    setMinuteDraft(pad(selected.minutes));
  }, [selected.hours, selected.minutes]);

  useLayoutEffect(() => {
    if (!open || pickerMode !== 'days' || !focusCalendarRef.current) return;
    const next = initialFocusIndex;
    setFocusIndex(next);
    focusCalendarRef.current = false;
    dayRefs.current[next]?.focus();
  }, [cells, initialFocusIndex, open, pickerMode]);

  // Measure available space and flip the dropdown if it would be clipped.
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const compute = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = dropdownRef.current?.getBoundingClientRect().height ?? 420;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setPlacement('top');
      } else {
        setPlacement('bottom');
      }
    };
    compute();
    window.addEventListener('resize', compute);
    const scrollContainer = containerRef.current.closest('main');
    window.addEventListener('scroll', compute, { passive: true });
    scrollContainer?.addEventListener('scroll', compute, { passive: true });
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute);
      scrollContainer?.removeEventListener('scroll', compute);
    };
  }, [open]);

  // Reset slide direction after animation completes
  useEffect(() => {
    if (slideDir !== 0) {
      const id = window.setTimeout(() => setSlideDir(0), 300);
      return () => window.clearTimeout(id);
    }
  }, [slideDir, year, month]);

  // Generate year range for year picker (centered on current view year)
  const yearRange = useMemo(() => {
    const start = year - 4;
    return Array.from({ length: 9 }, (_, i) => start + i);
  }, [year]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <span id={labelId} className="mb-2 block text-sm text-ink-soft">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            closePicker(true);
            return;
          }
          setView({ year: selectedYear, month: selectedMonth });
          setPickerMode('days');
          setSlideDir(0);
          setHourDraft(pad(selected.hours));
          setMinuteDraft(pad(selected.minutes));
          setValidationError(null);
          focusCalendarRef.current = true;
          setOpen(true);
        }}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : 'Choose date and time'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-left text-sm text-ink outline-none transition-colors',
          open
            ? 'border-accent ring-1 ring-accent/20'
            : 'border-line-strong hover:border-line-strong',
        )}
      >
        <CalendarIcon width={16} height={16} className="shrink-0 text-ink-faint" />
        <span className="tabular">{display}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropdownRef}
            role="dialog"
            aria-label="Choose date and time"
            initial={{ opacity: 0, y: placement === 'bottom' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'bottom' ? -6 : 6, scale: 0.97 }}
            transition={{ duration: 0.12 * m, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute left-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-xl shadow-black/10',
              placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
            )}
          >
            {/* Header: month navigation */}
            <div className="flex items-center justify-between px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setSlideDir(-1);
                  setView((currentView) => shiftMonth(currentView, -1));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeftIcon width={16} height={16} />
              </button>
              <button
                type="button"
                onClick={() => setPickerMode((m) => (m === 'days' ? 'months' : 'days'))}
                className="flex min-h-11 items-center justify-center rounded-lg px-3 py-1 text-sm font-medium text-ink transition-colors hover:bg-ink/5 active:bg-ink/5"
                aria-label="Open month and year selector"
              >
                {MONTHS[month]} {year}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSlideDir(1);
                  setView((currentView) => shiftMonth(currentView, 1));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink"
                aria-label="Next month"
              >
                <ChevronRightIcon width={16} height={16} />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {pickerMode === 'days' && (
                <motion.div
                  key={`days-${year}-${month}`}
                  initial={slideDir !== 0 ? { x: slideDir * 40, opacity: 0 } : { x: 0, opacity: 1 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: slideDir * -40, opacity: 0 }}
                  transition={{ duration: 0.12 * m, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 px-3 pb-1">
                    {DAYS.map((d) => (
                      <div
                        key={d}
                        className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-faint"
                      >
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Calendar grid */}
                  <div
                    role="group"
                    aria-label={`${MONTHS[month]} ${year}`}
                    className="grid grid-cols-7 px-3 pb-3"
                    onKeyDown={handleDayKeyDown}
                  >
                    {cells.map((cell, i) => {
                      const isSelected =
                        cell.currentMonth &&
                        cell.day === selectedDay &&
                        month === selectedMonth &&
                        year === selectedYear;
                      const isToday =
                        cell.currentMonth &&
                        cell.day === todayDay &&
                        month === todayMonth &&
                        year === todayYear;
                      const isFocused = focusIndex === i;

                      return (
                        <button
                          key={i}
                          ref={(element) => {
                            dayRefs.current[i] = element;
                          }}
                          type="button"
                          tabIndex={isFocused ? 0 : -1}
                          aria-label={`${cell.day} ${MONTHS[resolveAdjacentMonth(cell.day, cell.currentMonth, year, month).m]} ${resolveAdjacentMonth(cell.day, cell.currentMonth, year, month).y}`}
                          aria-current={isSelected ? 'date' : undefined}
                          onFocus={() => setFocusIndex(i)}
                          onClick={() => selectDay(cell.day, cell.currentMonth)}
                          className={cn(
                            'relative mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm outline-none transition-colors',
                            cell.currentMonth ? 'text-ink' : 'text-ink-faint/60',
                            isSelected && 'bg-accent font-medium text-accent-fg hover:bg-accent',
                            !isSelected && isToday && 'ring-1 ring-inset ring-accent/40',
                            !isSelected &&
                              !isToday &&
                              cell.currentMonth &&
                              'hover:bg-ink/5 active:bg-ink/5',
                            isFocused && !isSelected && 'ring-2 ring-inset ring-accent/50',
                          )}
                        >
                          {cell.day}
                          {isToday && !isSelected && (
                            <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-accent" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {pickerMode === 'months' && (
                <motion.div
                  key="months"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.12 * m }}
                  className="px-3 pb-3"
                >
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerMode('years')}
                      className="text-xs font-medium text-accent transition-opacity hover:opacity-80 active:opacity-80"
                    >
                      {year}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHS.map((m, i) => {
                      const isCurrent = i === month;
                      const isSelected = i === selectedMonth && year === selectedYear;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setView({ year, month: i });
                            setPickerMode('days');
                            focusCalendarRef.current = true;
                          }}
                          className={cn(
                            'rounded-lg px-2 py-2.5 text-xs font-medium transition-colors',
                            isSelected
                              ? 'bg-accent text-accent-fg'
                              : isCurrent
                                ? 'bg-accent-soft text-accent'
                                : 'text-ink-soft hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink',
                          )}
                        >
                          {m.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {pickerMode === 'years' && (
                <motion.div
                  key="years"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.12 * m }}
                  className="px-3 pb-3"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {yearRange.map((y) => {
                      const isCurrent = y === year;
                      const isSelected = y === selectedYear;
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => {
                            setView({ year: y, month });
                            setPickerMode('months');
                          }}
                          className={cn(
                            'rounded-lg px-2 py-2.5 text-xs font-medium transition-colors',
                            isSelected
                              ? 'bg-accent text-accent-fg'
                              : isCurrent
                                ? 'bg-accent-soft text-accent'
                                : 'text-ink-soft hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink',
                          )}
                        >
                          {y}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Time selector */}
            <div className="border-t border-line px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
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
                    onChange={(e) => {
                      if (/^\d{0,2}$/.test(e.target.value)) setHourDraft(e.target.value);
                      setValidationError(null);
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
                    className="h-8 w-12 rounded-lg border border-line-strong bg-paper text-center text-sm text-ink outline-none focus:border-accent tabular"
                  />
                  <span className="text-ink-faint">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Minute"
                    maxLength={2}
                    value={minuteDraft}
                    onChange={(e) => {
                      if (/^\d{0,2}$/.test(e.target.value)) setMinuteDraft(e.target.value);
                      setValidationError(null);
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
                    className="h-8 w-12 rounded-lg border border-line-strong bg-paper text-center text-sm text-ink outline-none focus:border-accent tabular"
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
                  setValidationError(null);
                  onChange(ms);
                  setView({ year: nowComponents.year, month: nowComponents.month });
                }}
                className="text-xs font-medium text-accent transition-opacity hover:opacity-80 active:opacity-80"
              >
                Jump to today
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = Date.now();
                  const nowComponents = getComponentsInZone(now, timeZone);
                  const ms = fromDateTimeLocalValue(
                    `${nowComponents.year}-${pad(nowComponents.month + 1)}-${pad(nowComponents.day)}T${pad(nowComponents.hours)}:${pad(nowComponents.minutes)}`,
                    timeZone,
                  );
                  if (!Number.isFinite(ms)) return;
                  setValidationError(null);
                  onChange(ms);
                  setView({ year: nowComponents.year, month: nowComponents.month });
                }}
                className="text-xs font-medium text-ink-soft transition-opacity hover:text-ink active:text-ink"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (commitTimeDrafts()) closePicker(true);
                }}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 active:opacity-80"
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
