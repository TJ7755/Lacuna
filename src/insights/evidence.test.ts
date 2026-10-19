import { expect, it } from 'vitest';
import { encodeDailyEvidence, parseDailyEvidence, type DailyEvidenceEvent } from './evidence';

const context = { shareId: 'a'.repeat(32), day: '2026-10-18' };
const pupil = { id: 'b'.repeat(32), label: 'Pupil A' };
function event(index = 0): DailyEvidenceEvent {
  return {
    id: `event-${index}`,
    kind: 'question',
    at: Date.parse('2026-10-18T12:00:00Z'),
    itemId: 'q1',
    prompt: 'Explain osmosis.',
    answer: 'Water crosses a membrane.',
    conceptIds: ['c1'],
    earned: 1,
    available: 2,
    retained: null,
    criteria: [{ id: 'criterion-1', label: 'Membrane', earned: 1, available: 2 }],
    marking: 'automatic',
    disputed: false,
    shortened: false,
  };
}
it('round-trips encrypted-payload evidence and refuses another course or day', () => {
  const bytes = encodeDailyEvidence({ ...context, pupil, events: [event()], omitted: 0 });
  expect(parseDailyEvidence(bytes, context).events[0].answer).toBe('Water crosses a membrane.');
  expect(() => parseDailyEvidence(bytes, { ...context, shareId: 'c'.repeat(32) })).toThrow();
  expect(() => parseDailyEvidence(bytes, { ...context, day: '2026-10-19' })).toThrow();
  expect(() =>
    encodeDailyEvidence({ ...context, pupil, events: [{ ...event(), earned: 3 }], omitted: 0 }),
  ).toThrow();
  expect(() =>
    encodeDailyEvidence({
      ...context,
      pupil,
      events: [{ ...event(), at: Date.parse('2026-10-19') }],
      omitted: 0,
    }),
  ).toThrow();
});
it('bounds report size and rejects unknown fields, invalid marks and unsupported versions', () => {
  const bytes = encodeDailyEvidence({ ...context, pupil, events: [], omitted: 0 });
  const raw = JSON.parse(new TextDecoder().decode(bytes));
  for (const changed of [
    { extra: 'private' },
    { v: 2 },
    { pupil: { ...pupil, secret: true } },
    { events: Array.from({ length: 201 }, (_, i) => event(i)) },
  ])
    expect(() =>
      parseDailyEvidence(new TextEncoder().encode(JSON.stringify({ ...raw, ...changed })), context),
    ).toThrow();
  expect(() => parseDailyEvidence(new Uint8Array(65537), context)).toThrow();
});
