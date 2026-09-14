import { Rating } from 'ts-fsrs';
import { makeEngine } from '../../fsrs/fsrs';
import { defaultFsrsParameters } from '../../fsrs/params';

const engine = makeEngine({ ...defaultFsrsParameters(), enable_fuzz: false });
export const EXAM_DAY = 6;
export const SLOT_HOURS = [8, 13, 18];
export const slotTime = (slot: number) => Math.floor(slot / 3) + SLOT_HOURS[slot % 3] / 24;

// A representative card with successful reviews illustrates the existing memory model.
export function projectCalendar(slots: number[]) {
  let memory = { stability: 2, difficulty: 5 };
  let last = 0;
  const points: [number, number][] = [[0, 1]];
  const reviews = slots.map(slotTime).sort((a, b) => a - b);
  for (const end of [...reviews, EXAM_DAY]) {
    for (let day = last + 0.1; day < end; day += 0.1) {
      points.push([day, engine.forgetting_curve(day - last, memory.stability)]);
    }
    points.push([end, engine.forgetting_curve(end - last, memory.stability)]);
    if (end !== EXAM_DAY) {
      memory = engine.next_state(memory, end - last, Rating.Good);
      last = end;
      points.push([end, 1]);
    }
  }
  return { points, recall: points[points.length - 1][1] };
}

export function planCalendar(available: number[]) {
  const candidates = [...new Set(available)].filter(
    (slot) => Number.isInteger(slot) && slot >= 0 && slot < EXAM_DAY * 3,
  );
  let selected: number[] = [];
  // Keep this demonstration small: up to three reviews, at most one per day.
  for (let count = 0; count < 3; count++) {
    let best = -1;
    let bestRecall = projectCalendar(selected).recall;
    for (const slot of candidates) {
      if (selected.some((item) => Math.floor(item / 3) === Math.floor(slot / 3))) continue;
      const recall = projectCalendar([...selected, slot]).recall;
      if (recall > bestRecall) {
        best = slot;
        bestRecall = recall;
      }
    }
    if (best < 0) break;
    selected = [...selected, best];
  }
  return selected.sort((a, b) => a - b);
}
