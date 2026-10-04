import { describe, expect, it } from 'vitest';
import { urgencyOrder } from './dashboardForecasts';

const NOW = Date.UTC(2026, 4, 21);
const DAY = 86_400_000;

describe('urgencyOrder', () => {
  it('puts the nearest exam first and courses without one last', () => {
    const rows = [
      { id: 'french', due: 9 },
      { id: 'chemistry', examDate: NOW + 28 * DAY, due: 14 },
      { id: 'biology', examDate: NOW + 22 * DAY, due: 24 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual(['biology', 'chemistry', 'french']);
  });

  it('treats a past exam like no exam and breaks ties by the larger workload', () => {
    const rows = [
      { id: 'old', examDate: NOW - DAY, due: 2 },
      { id: 'steady', due: 5 },
    ];
    expect(urgencyOrder(rows, NOW).map((row) => row.id)).toEqual(['steady', 'old']);
  });
});
