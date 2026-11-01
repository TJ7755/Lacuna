import { INSIGHT_DAILY_SLOTS } from '@lacuna/protocol/insights/index';
import { getInsightMailboxPage } from '../insights/mailbox';
import { openInsightEnvelope, type InsightsOwner } from '../insights/envelope';
import { parseDailyEvidence, type DailyEvidence } from '../insights/evidence';
import type { GapsCourseConnection } from './connectionFile';

export interface ReadClassReports {
  reports: { slotId: string; report: DailyEvidence }[];
  unreadable: number;
}

/** Plaintext stays in the caller’s memory; a bad packet cannot impersonate an empty report. */
export async function readClassReports(
  options: Omit<GapsCourseConnection, 'courseName'> & {
    owner: InsightsOwner;
    isoDay: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<ReadClassReports> {
  const reports: ReadClassReports['reports'] = [],
    slots = new Set<string>(),
    cursors = new Set<string>();
  let cursor: string | undefined,
    unreadable = 0;
  for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
    options.signal?.throwIfAborted();
    const page = await getInsightMailboxPage({ ...options, cursor });
    for (const row of page.envelopes) {
      if (slots.has(row.slotId) || slots.size >= INSIGHT_DAILY_SLOTS)
        throw new Error('Invalid report pagination.');
      slots.add(row.slotId);
      options.signal?.throwIfAborted();
      try {
        const bytes = await openInsightEnvelope(options.owner, row.envelope, options);
        const report = parseDailyEvidence(bytes, { shareId: options.shareId, day: options.isoDay });
        reports.push({ slotId: row.slotId, report });
      } catch {
        unreadable += 1;
      }
      options.signal?.throwIfAborted();
    }
    if (page.cursor === null) return { reports, unreadable };
    if (cursors.has(page.cursor)) throw new Error('Invalid report pagination.');
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  throw new Error('Invalid report pagination.');
}
