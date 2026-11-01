export interface CalendarView {
  year: number;
  month: number;
}

export const DAYS: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const MONTHS: string[] = [
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

export function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function shiftMonth(view: CalendarView, offset: number): CalendarView {
  const shifted = new Date(Date.UTC(view.year, view.month + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

/** Build a calendar month grid: { day: number, currentMonth: boolean }[]. */
export function buildMonth(year: number, month: number) {
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
export function resolveAdjacentMonth(
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
