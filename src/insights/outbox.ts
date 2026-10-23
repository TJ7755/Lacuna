import Dexie from 'dexie';
import { completedIsoDayLabel } from '../../relay/shared/insights/index';
import {
  INSIGHT_ID_RE,
  parseInsightEnvelope,
  type InsightEnvelope,
} from '../../relay/shared/insights/index';
import { normaliseRelayUrl } from '../sync/relay';
import { sealInsightEnvelope, type InsightsRecipient } from './envelope';
import { putInsightEnvelope } from './mailbox';

interface PacketIdentity {
  shareId: string;
  isoDay: string;
  relayUrl: string;
  keyId: string;
  slotId: string;
}
type SavedPacket = PacketIdentity &
  ({ status: 'pending'; envelope: InsightEnvelope } | { status: 'sent' });

interface DailyDelivery {
  shareId: string;
  relayUrl: string;
  recipient: InsightsRecipient;
  evidence(): Promise<Uint8Array>;
  isOptedIn(): boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** Explicit pupil-side delivery seam; opening it does not install a scheduler. */
export function createInsightsOutbox(
  databaseName = 'lacuna.insights.outbox',
  now: () => number = Date.now,
) {
  const database = new Dexie(databaseName);
  database.version(1).stores({ packets: '[shareId+isoDay], isoDay' });
  const packets = database.table<SavedPacket, [string, string]>('packets');

  return {
    async send(options: DailyDelivery): Promise<'idle' | 'sent'> {
      if (!options.isOptedIn() || options.signal?.aborted) return 'idle';
      if (!INSIGHT_ID_RE.test(options.shareId)) throw new Error('Invalid insights course.');
      const isoDay = completedIsoDayLabel(now());
      const context = {
        shareId: options.shareId,
        isoDay,
        relayUrl: normaliseRelayUrl(options.relayUrl),
        keyId: options.recipient.keyId,
      };
      const key: [string, string] = [context.shareId, isoDay];
      const stillAllowed = () =>
        options.isOptedIn() && !options.signal?.aborted && completedIsoDayLabel(now()) === isoDay;

      let packet = await packets.get(key);
      if (packet) {
        packet = checkSavedPacket(packet, context);
      } else {
        if (!stillAllowed()) return 'idle';
        const evidence = await options.evidence();
        if (!stillAllowed()) return 'idle';
        const envelope = await sealInsightEnvelope(options.recipient, evidence, context);
        if (!stillAllowed()) return 'idle';
        const candidate: SavedPacket = {
          ...context,
          slotId: crypto.randomUUID().replaceAll('-', ''),
          status: 'pending',
          envelope,
        };
        // Seal before the transaction. Concurrent tabs must use the committed winner.
        packet = await database.transaction('rw', packets, async () => {
          await packets.where('isoDay').below(isoDay).delete();
          const existing = await packets.get(key);
          if (existing) return checkSavedPacket(existing, context);
          await packets.add(candidate);
          return candidate;
        });
      }
      if (packet.status === 'sent' || !stillAllowed()) return 'idle';

      // A failed upload or failed acknowledgement commit leaves these exact bytes retryable.
      await putInsightEnvelope({ ...packet, fetchImpl: options.fetchImpl, signal: options.signal });
      await database.transaction('rw', packets, async () => {
        const saved = await packets.get(key);
        if (!saved) return; // A newer day may already have pruned this packet.
        const current = checkSavedPacket(saved, context);
        if (current.slotId !== packet.slotId) throw new Error('The insights retry slot changed.');
        await packets.put({ ...context, slotId: packet.slotId, status: 'sent' });
      });
      return 'sent';
    },

    close(): void {
      database.close();
    },
  };
}

function checkSavedPacket(raw: SavedPacket, context: Omit<PacketIdentity, 'slotId'>): SavedPacket {
  if (
    !raw ||
    !['pending', 'sent'].includes(raw.status) ||
    Object.keys(raw).length !== (raw.status === 'pending' ? 7 : 6) ||
    !INSIGHT_ID_RE.test(raw.slotId) ||
    !/^[0-9a-f]{64}$/.test(raw.keyId) ||
    raw.shareId !== context.shareId ||
    raw.isoDay !== context.isoDay ||
    raw.relayUrl !== context.relayUrl ||
    raw.keyId !== context.keyId
  ) {
    throw new Error('The saved insights packet does not match this course, relay or teacher key.');
  }
  if (raw.status === 'pending') {
    const envelope = parseInsightEnvelope(raw.envelope, context);
    if (envelope.k !== context.keyId) throw new Error('The saved insights recipient changed.');
    return { ...raw, envelope };
  }
  return raw;
}
