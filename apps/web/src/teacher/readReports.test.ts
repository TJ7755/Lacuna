import { expect, it } from 'vitest';
import { createInsightsOwner, sealInsightEnvelope } from '../insights/envelope';
import { encodeDailyEvidence } from '../insights/evidence';
import { readClassReports } from './readReports';

it('decrypts bounded pages, isolates unreadable packets and refuses looping cursors', async () => {
  const shareId = 'a'.repeat(32),
    isoDay = '2026-10-18';
  const owner = await createInsightsOwner('a separate long teacher recovery phrase', shareId);
  const report = {
    shareId,
    day: isoDay,
    pupil: { id: 'b'.repeat(32), label: 'Pupil A' },
    events: [],
    omitted: 0,
  };
  const envelope = await sealInsightEnvelope(owner.recipient, encodeDailyEvidence(report), {
    shareId,
    isoDay,
  });
  const broken = { ...envelope, c: btoa(String.fromCharCode(...new Uint8Array(16))) };
  const options = {
    owner,
    shareId,
    isoDay,
    relayUrl: 'https://relay.example',
    writeToken: 'c'.repeat(64),
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        v: 2,
        cursor: null,
        envelopes: [
          { slotId: 'd'.repeat(32), envelope },
          { slotId: 'e'.repeat(32), envelope: broken },
        ],
      }),
    );
  expect(await readClassReports({ ...options, fetchImpl })).toMatchObject({
    reports: [{ slotId: 'd'.repeat(32), report: { pupil: report.pupil } }],
    unreadable: 1,
  });
  const loop: typeof fetch = async () =>
    new Response(JSON.stringify({ v: 2, cursor: 'same', envelopes: [] }));
  await expect(readClassReports({ ...options, fetchImpl: loop })).rejects.toThrow(/pagination/);
}, 30_000);
