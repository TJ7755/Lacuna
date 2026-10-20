import { expect, it } from 'vitest';
import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';
import {
  band,
  eventScore,
  groupAnswers,
  itemsToRevisit,
  outcomeLabel,
  percent,
  pupilScore,
  summariseItems,
} from './classInsights';

function event(overrides: Partial<DailyEvidenceEvent>): DailyEvidenceEvent {
  return {
    id: 'e',
    kind: 'question',
    at: 0,
    itemId: 'q1',
    prompt: 'Name the organelle.',
    answer: '',
    conceptIds: [],
    earned: 1,
    available: 1,
    retained: null,
    criteria: [],
    marking: 'automatic',
    disputed: false,
    shortened: false,
    ...overrides,
  };
}

function report(id: string, events: DailyEvidenceEvent[]): DailyEvidence {
  return {
    v: 1,
    shareId: 'a'.repeat(32),
    day: '2026-10-19',
    pupil: { id: id.repeat(32), label: id },
    events,
    omitted: 0,
  };
}

it('keeps unknown evidence unknown instead of scoring it as zero', () => {
  expect(eventScore(event({ earned: null, available: 2, marking: 'self' }))).toBeNull();
  expect(
    eventScore(event({ marking: 'recall', retained: null, earned: null, available: null })),
  ).toBeNull();
  expect(eventScore(event({ marking: 'recall', retained: false }))).toBe(0);
  expect(band(null)).toBe('unknown');
  expect(percent(null)).toBe('–');
  expect(pupilScore(report('a', [event({ earned: null }), event({ earned: 1 })]))).toBe(1);
  expect(outcomeLabel(event({ earned: null, available: 2 }))).toBe('Unknown / 2 marks');
});

it('bands scores at secure and partial thresholds', () => {
  expect([0.75, 0.74, 0.4, 0.39].map(band)).toEqual(['secure', 'partial', 'partial', 'gap']);
});

it('weights each pupil once per item and sorts weakest first with unknown last', () => {
  const items = summariseItems([
    // Three wrong attempts by one pupil must not outweigh another pupil's single right answer.
    report('a', [
      event({ id: '1', earned: 0 }),
      event({ id: '2', earned: 0 }),
      event({ id: '3', earned: 0 }),
      event({ id: '4', itemId: 'q2', earned: null }),
    ]),
    report('b', [event({ id: '5', earned: 1 }), event({ id: '6', itemId: 'q3', earned: 1 })]),
  ]);
  expect(items.map((item) => [item.itemId, item.score])).toEqual([
    ['q1', 0.5],
    ['q3', 1],
    ['q2', null],
  ]);
  expect(items[0]).toMatchObject({ pupils: 2, gaps: 1 });
  expect(itemsToRevisit(items).map((item) => item.itemId)).toEqual(['q1']);
});

it('groups identical answers regardless of case, weakest first', () => {
  const [item] = summariseItems([
    report('a', [event({ answer: 'Nucleus', earned: 0 })]),
    report('b', [event({ answer: 'nucleus ', earned: 0 })]),
    report('c', [event({ answer: 'Ribosome', earned: 1 })]),
  ]);
  expect(groupAnswers(item).map((group) => [group.answer, group.answers.length])).toEqual([
    ['Nucleus', 2],
    ['Ribosome', 1],
  ]);
});

it('separates identical answers with different evidence provenance', () => {
  const [item] = summariseItems([
    report('a', [event({ answer: 'same', marking: 'automatic' })]),
    report('b', [event({ answer: 'same', marking: 'self' })]),
    report('c', [event({ answer: 'same', disputed: true })]),
    report('d', [event({ answer: 'same', shortened: true })]),
  ]);
  expect(groupAnswers(item).map((group) => group.answers.length)).toEqual([1, 1, 1, 1]);
});
