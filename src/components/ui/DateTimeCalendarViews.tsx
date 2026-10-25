import { m as motion } from 'motion/react';
import type { KeyboardEventHandler, RefObject } from 'react';
import { cn } from './cn';
import { DAYS, MONTHS, resolveAdjacentMonth, type buildMonth } from './dateTimeCalendar';

export function renderDaysCalendar({
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
}: {
  year: number;
  month: number;
  slideDir: number;
  m: number;
  handleDayKeyDown: KeyboardEventHandler<HTMLDivElement>;
  cells: ReturnType<typeof buildMonth>;
  selectedDay: number;
  selectedMonth: number;
  selectedYear: number;
  todayDay: number;
  todayMonth: number;
  todayYear: number;
  focusIndex: number | null;
  dayRefs: RefObject<Array<HTMLButtonElement | null>>;
  setFocusIndex: (index: number) => void;
  selectDay: (day: number, currentMonth: boolean) => void;
}) {
  return (
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
          <div key={d} className="py-1 text-center text-sm font-medium text-ink-faint">
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
                'relative mx-auto my-0.5 flex h-11 w-11 items-center justify-center rounded-full text-sm outline-none transition-colors',
                cell.currentMonth ? 'text-ink' : 'text-ink-faint/60',
                isSelected && 'bg-accent font-medium text-accent-fg hover:bg-accent',
                !isSelected && isToday && 'ring-1 ring-inset ring-accent/40',
                !isSelected && !isToday && cell.currentMonth && 'hover:bg-ink/5 active:bg-ink/5',
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
  );
}

export function renderMonthsCalendar({
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
}: {
  m: number;
  year: number;
  handleMonthKeyDown: KeyboardEventHandler<HTMLDivElement>;
  month: number;
  selectedMonth: number;
  selectedYear: number;
  monthRefs: RefObject<Array<HTMLButtonElement | null>>;
  monthFocusIndex: number;
  setMonthFocusIndex: (index: number) => void;
  selectMonth: (index: number) => void;
}) {
  return (
    <motion.div
      key="months"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12 * m }}
      className="px-3 pb-3"
    >
      <div
        role="group"
        aria-label={`Choose month in ${year}`}
        className="grid grid-cols-3 gap-2"
        onKeyDown={handleMonthKeyDown}
      >
        {MONTHS.map((m, i) => {
          const isCurrent = i === month;
          const isSelected = i === selectedMonth && year === selectedYear;
          return (
            <button
              key={m}
              ref={(element) => {
                monthRefs.current[i] = element;
              }}
              type="button"
              tabIndex={monthFocusIndex === i ? 0 : -1}
              aria-label={m}
              onFocus={() => setMonthFocusIndex(i)}
              onClick={() => selectMonth(i)}
              className={cn(
                'rounded-xl px-2 py-2.5 text-xs font-medium transition-colors min-h-11',
                isSelected
                  ? 'bg-accent text-accent-fg'
                  : isCurrent
                    ? 'bg-accent-soft text-accent-ink'
                    : 'text-ink-soft hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink',
              )}
            >
              {m.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export function renderYearsCalendar({
  m,
  yearRange,
  handleYearKeyDown,
  year,
  selectedYear,
  yearRefs,
  yearFocusIndex,
  setYearFocusIndex,
  selectYear,
}: {
  m: number;
  yearRange: number[];
  handleYearKeyDown: KeyboardEventHandler<HTMLDivElement>;
  year: number;
  selectedYear: number;
  yearRefs: RefObject<Array<HTMLButtonElement | null>>;
  yearFocusIndex: number;
  setYearFocusIndex: (index: number) => void;
  selectYear: (index: number) => void;
}) {
  return (
    <motion.div
      key="years"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12 * m }}
      className="px-3 pb-3"
    >
      <div
        role="group"
        aria-label={`Choose year from ${yearRange[0]} to ${yearRange[yearRange.length - 1]}`}
        className="grid grid-cols-3 gap-2"
        onKeyDown={handleYearKeyDown}
      >
        {yearRange.map((y, i) => {
          const isCurrent = y === year;
          const isSelected = y === selectedYear;
          return (
            <button
              key={y}
              ref={(element) => {
                yearRefs.current[i] = element;
              }}
              type="button"
              tabIndex={yearFocusIndex === i ? 0 : -1}
              aria-label={String(y)}
              onFocus={() => setYearFocusIndex(i)}
              onClick={() => selectYear(i)}
              className={cn(
                'rounded-xl px-2 py-2.5 text-xs font-medium transition-colors min-h-11',
                isSelected
                  ? 'bg-accent text-accent-fg'
                  : isCurrent
                    ? 'bg-accent-soft text-accent-ink'
                    : 'text-ink-soft hover:bg-ink/5 hover:text-ink active:bg-ink/5 active:text-ink',
              )}
            >
              {y}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
