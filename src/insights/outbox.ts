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
  isCurrent?(): Promise<boolean>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export type InsightsPublicationResult = 'idle' | 'sent' | 'unchanged';

type SnapshotPacket = PacketIdentity & {
  status: 'pending' | 'sent';
  writeToken: string;
  revision: number;
  evidenceHash: string;
  envelope: InsightEnvelope;
};
const currentIsoDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Explicit pupil-side delivery seam; opening it does not install a scheduler. */
export function createInsightsOutbox(
  databaseName = 'lacuna.insights.outbox',
  now: () => number = Date.now,
) {
  const database = new Dexie(databaseName);
  database.version(1).stores({ packets: '[shareId+isoDay], isoDay' });
  database.version(2).stores({ snapshots: '[shareId+isoDay], isoDay' });
  const snapshots = database.table<SnapshotPacket, [string, string]>('snapshots');
  const packets = database.table<SavedPacket, [string, string]>('packets');

  return {
    async send(options: DailyDelivery): Promise<InsightsPublicationResult> {
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

      if (await snapshots.get(key)) return this.publish(options, true);
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
        packet = await database.transaction('rw', [packets, snapshots], async () => {
          if (await snapshots.get(key)) return undefined;
          await packets.where('isoDay').below(isoDay).delete();
          const existing = await packets.get(key);
          if (existing) return checkSavedPacket(existing, context);
          await packets.add(candidate);
          return candidate;
        });
      }
      if (!packet) return this.publish(options, true);
      if (packet.status === 'sent' || !stillAllowed()) return 'idle';

      // A failed upload or failed acknowledgement commit leaves these exact bytes retryable.
      if (options.isCurrent && !(await options.isCurrent())) return 'idle';
      if (!stillAllowed()) return 'idle';
      await putInsightEnvelope({ ...packet, fetchImpl: options.fetchImpl, signal: options.signal });
      if (options.isCurrent && !(await options.isCurrent())) return 'idle';
      if (!stillAllowed()) return 'idle';
      await database.transaction('rw', packets, async () => {
        const saved = await packets.get(key);
        if (!saved) return; // A newer day may already have pruned this packet.
        const current = checkSavedPacket(saved, context);
        if (current.slotId !== packet.slotId) throw new Error('The insights retry slot changed.');
        await packets.put({ ...context, slotId: packet.slotId, status: 'sent' });
      });
      return 'sent';
    },

    async publish(
      options: DailyDelivery,
      completedDay = false,
    ): Promise<InsightsPublicationResult> {
      const startedDay = currentIsoDay(now());
      const isoDay = completedDay ? completedIsoDayLabel(now()) : startedDay;
      const stillAllowed = () =>
        options.isOptedIn() && !options.signal?.aborted && currentIsoDay(now()) === startedDay;
      const allowed = async () =>
        stillAllowed() && (!options.isCurrent || (await options.isCurrent())) && stillAllowed();
      if (!(await allowed())) return 'idle';
      if (!INSIGHT_ID_RE.test(options.shareId)) throw new Error('Invalid insights course.');
      const context = {
        shareId: options.shareId,
        isoDay,
        relayUrl: normaliseRelayUrl(options.relayUrl),
        keyId: options.recipient.keyId,
      };
      const key: [string, string] = [context.shareId, isoDay];
      const read = () =>
        database.transaction('rw', [snapshots, packets], async () => {
          const raw = await snapshots.get(key);
          if (!raw) return undefined;
          const packet = checkSnapshot(raw, context);
          const claim = await packets.get(key);
          if (claim) checkSnapshotClaim(claim, packet);
          else await packets.add(snapshotClaim(packet));
          return packet;
        });
      const initial = await read();
      const legacy = await packets.get(key);
      if (legacy && !initial) {
        const saved = checkSavedPacket(legacy, context);
        if (saved.status === 'sent') return 'unchanged';
        return this.send(options);
      }
      let sent = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        let fresh = false;
        if (!(await allowed())) return 'idle';
        let packet = await read();
        if (!packet || packet.status === 'sent') {
          const evidence = await options.evidence();
          if (!(await allowed())) return 'idle';
          const evidenceHash = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(evidence))),
            (byte) => byte.toString(16).padStart(2, '0'),
          ).join('');
          if (packet?.evidenceHash === evidenceHash) {
            const current = await read();
            if (!(await allowed())) return 'idle';
            if (current?.status === 'sent' && sameSnapshot(current, packet))
              return sent ? 'sent' : 'unchanged';
            continue;
          }
          if (packet?.revision === Number.MAX_SAFE_INTEGER)
            throw new Error('The insights revision limit has been reached.');
          const envelope = await sealInsightEnvelope(options.recipient, evidence, context);
          if (!(await allowed())) return 'idle';
          const previous = packet;
          const candidate: SnapshotPacket = {
            ...context,
            slotId: previous?.slotId ?? crypto.randomUUID().replaceAll('-', ''),
            writeToken:
              previous?.writeToken ??
              Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
                byte.toString(16).padStart(2, '0'),
              ).join(''),
            revision: (previous?.revision ?? 0) + 1,
            evidenceHash,
            envelope,
            status: 'pending',
          };
          // Commit before fetch. A racing tab must use the winner, never its own resealed bytes.
          packet = await database.transaction('rw', [snapshots, packets], async () => {
            if (!stillAllowed()) return undefined;
            const raw = await snapshots.get(key);
            const current = raw ? checkSnapshot(raw, context) : undefined;
            if (current && (!previous || !sameSnapshot(current, previous))) return current;
            if (previous && !current) throw new Error('The insights snapshot disappeared.');
            const claim = await packets.get(key);
            if (claim) {
              if (!current)
                throw new Error('The daily insights slot was claimed in another tab. Try again.');
              checkSnapshotClaim(claim, current);
            } else await packets.add(snapshotClaim(candidate));
            await snapshots.put(candidate);
            return candidate;
          });
          if (!packet || !(await allowed())) return 'idle';
          if (packet.status === 'sent') continue;
          fresh = sameSnapshot(packet, candidate);
        }
        if (!(await allowed())) return 'idle';
        try {
          await putInsightEnvelope({
            ...packet,
            snapshot: { writeToken: packet.writeToken, revision: packet.revision },
            fetchImpl: options.fetchImpl,
            signal: options.signal,
          });
        } catch (error) {
          if (!(await allowed())) return 'idle';
          const current = await read();
          // A delayed retry may receive 409 after another tab has already advanced the slot.
          if (current && (!sameSnapshot(current, packet) || current.status === 'sent')) continue;
          throw error;
        }
        if (!(await allowed())) return 'idle';
        const acknowledged = await database.transaction('rw', [snapshots, packets], async () => {
          if (!stillAllowed()) return false;
          const raw = await snapshots.get(key);
          if (!raw) throw new Error('The insights snapshot disappeared.');
          const current = checkSnapshot(raw, context);
          if (!sameSnapshot(current, packet) || current.status !== 'pending') return false;
          const claim = await packets.get(key);
          if (!claim) throw new Error('The daily insights claim disappeared.');
          checkSnapshotClaim(claim, current);
          await snapshots.put({ ...current, status: 'sent' });
          await packets.put(snapshotClaim({ ...current, status: 'sent' }));
          return true;
        });
        sent ||= acknowledged;
        if (fresh) {
          const current = await read();
          if (!(await allowed())) return 'idle';
          if (current?.status === 'sent') return sent ? 'sent' : 'unchanged';
          // A newer revision can still be pending after our stale acknowledgement. Reconcile it.
        }
        // Pending evidence may predate this action. Retry it, then publish one fresh snapshot.
      }
      throw new Error('Progress changed in another tab. Try sending again.');
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

function sameSnapshot(a: SnapshotPacket, b: SnapshotPacket): boolean {
  return (
    a.slotId === b.slotId &&
    a.writeToken === b.writeToken &&
    a.revision === b.revision &&
    a.evidenceHash === b.evidenceHash &&
    JSON.stringify(a.envelope) === JSON.stringify(b.envelope)
  );
}

function checkSnapshot(
  raw: SnapshotPacket,
  context: Omit<PacketIdentity, 'slotId'>,
): SnapshotPacket {
  if (
    !raw ||
    Object.keys(raw).length !== 10 ||
    !['pending', 'sent'].includes(raw.status) ||
    !INSIGHT_ID_RE.test(raw.slotId) ||
    !/^[0-9a-f]{64}$/.test(raw.writeToken) ||
    !/^[0-9a-f]{64}$/.test(raw.evidenceHash) ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1 ||
    raw.shareId !== context.shareId ||
    raw.isoDay !== context.isoDay ||
    raw.relayUrl !== context.relayUrl ||
    raw.keyId !== context.keyId
  ) {
    throw new Error(
      'The saved insights snapshot does not match this course, relay or teacher key.',
    );
  }
  const envelope = parseInsightEnvelope(raw.envelope, context);
  if (envelope.k !== context.keyId) throw new Error('The saved insights recipient changed.');
  return { ...raw, envelope };
}

function snapshotClaim(packet: SnapshotPacket): SavedPacket {
  const { shareId, isoDay, relayUrl, keyId, slotId } = packet;
  const identity = { shareId, isoDay, relayUrl, keyId, slotId };
  // Old tabs understand this row. Before ACK they can only retry the same protected slot.
  return packet.status === 'sent'
    ? { ...identity, status: 'sent' }
    : { ...identity, status: 'pending', envelope: packet.envelope };
}

function checkSnapshotClaim(raw: SavedPacket, packet: SnapshotPacket): void {
  const claim = checkSavedPacket(raw, packet);
  if (
    claim.slotId !== packet.slotId ||
    (claim.status === 'pending' &&
      JSON.stringify(claim.envelope) !== JSON.stringify(packet.envelope))
  )
    throw new Error('The daily insights slot belongs to a different packet.');
}
