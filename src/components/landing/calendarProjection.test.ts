import { describe, expect, it } from 'vitest';
import { EXAM_DAY, planCalendar, projectCalendar, slotTime } from './calendarProjection';

describe('calendar availability example', () => {
  it('schedules only available slots before the fixed exam, at most once a day', () => {
    const available = [0, 1, 4, 8, 9, 10, 17, 18, -1];
    const plan = planCalendar(available);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(3);
    expect(plan.every((slot) => available.includes(slot) && slotTime(slot) < EXAM_DAY)).toBe(true);
    expect(new Set(plan.map((slot) => Math.floor(slot / 3))).size).toBe(plan.length);
  });
  it('removes unavailable reviews and recalculates the forgetting curve', () => {
    const plan = planCalendar([4, 9, 17]);
    expect(plan).toEqual([4, 9, 17]);
    const changed = planCalendar([4, 9]);
    expect(changed).not.toContain(17);
    expect(projectCalendar(changed).points).not.toEqual(projectCalendar(plan).points);
    expect(projectCalendar(plan).recall).toBeGreaterThan(projectCalendar([]).recall);
    expect(planCalendar([])).toEqual([]);
  });
});
