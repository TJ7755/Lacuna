import { calendarKeyboardDate } from './calendarKeyboardDate';
import { resolveAdjacentMonth, type buildMonth, type CalendarView } from './dateTimeCalendar';

type DayAction =
  | { kind: 'select'; day: number; currentMonth: boolean }
  | { kind: 'move'; view: CalendarView; index: number; direction: -1 | 0 | 1 };

/** Resolve a grid key without changing selection or moving DOM focus. */
export function dateTimePickerDayAction(
  view: CalendarView,
  cells: ReturnType<typeof buildMonth>,
  index: number,
  key: string,
  shiftKey: boolean,
): DayAction | null {
  const cell = cells[index];
  if (!cell) return null;
  if (key === 'Enter' || key === ' ') {
    return { kind: 'select', day: cell.day, currentMonth: cell.currentMonth };
  }

  const { year, month } = view;
  const { y, m } = resolveAdjacentMonth(cell.day, cell.currentMonth, year, month);
  // UTC is a calendar coordinate here, never the chosen instant.
  const next = calendarKeyboardDate(y, m, cell.day, key, shiftKey);
  if (!next) return null;
  if (next.year !== year || next.month !== month) {
    return {
      kind: 'move',
      view: { year: next.year, month: next.month },
      index: new Date(Date.UTC(next.year, next.month, 1)).getUTCDay() + next.day - 1,
      direction: next.year * 12 + next.month > year * 12 + month ? 1 : -1,
    };
  }
  return {
    kind: 'move',
    view: { year: next.year, month: next.month },
    index: cells.findIndex((candidate) => candidate.currentMonth && candidate.day === next.day),
    direction: 0,
  };
}
