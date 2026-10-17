/** Move a calendar date without letting local daylight-saving changes alter the day. */
export function calendarKeyboardDate(
  year: number,
  month: number,
  day: number,
  key: string,
  shiftKey: boolean,
): { year: number; month: number; day: number } | null {
  const date = new Date(Date.UTC(year, month, day));
  let offset: number;
  switch (key) {
    case 'ArrowLeft':
      offset = -1;
      break;
    case 'ArrowRight':
      offset = 1;
      break;
    case 'ArrowUp':
      offset = -7;
      break;
    case 'ArrowDown':
      offset = 7;
      break;
    case 'Home':
      offset = -date.getUTCDay();
      break;
    case 'End':
      offset = 6 - date.getUTCDay();
      break;
    case 'PageUp':
    case 'PageDown': {
      const months = (key === 'PageUp' ? -1 : 1) * (shiftKey ? 12 : 1);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + months);
      const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
      offset = 0;
      break;
    }
    default:
      return null;
  }
  date.setUTCDate(date.getUTCDate() + offset);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}
