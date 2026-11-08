import Dexie from 'dexie';
import { USAGE_MAX_ROWS, type UsageBatch, type UsageKey } from '@lacuna/protocol/usage';

const DAY_MS = 86_400_000;
const QUEUE_LIMIT = 48;
export const USAGE_DATABASE_NAME = 'lacuna.usage';
export const USAGE_COUNT_LIMIT = 1_000;

export type UsageDelta = { rows: Map<UsageKey, number>; used: Set<string> };
type SeenMetric = { day: string; key: UsageKey };
type FirstUse = { key: string; day: string; returned?: true };

export function usageDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Separate device-local database. Neither its history nor a browser ID is uploaded. */
export function createUsageOutbox(name = USAGE_DATABASE_NAME, now = Date.now) {
  const database = new Dexie(name);
  database.version(1).stores({ batches: 'id, day', seen: '[day+key], day', first: 'key, day' });
  const batches = database.table<UsageBatch, string>('batches');
  const seen = database.table<SeenMetric, [string, UsageKey]>('seen');
  const first = database.table<FirstUse, string>('first');

  return {
    persist(deltas: ReadonlyMap<string, UsageDelta>, permitted: () => boolean) {
      return database.transaction('rw', batches, seen, first, async () => {
        if (!permitted()) return;
        const oldest = usageDay(now() - DAY_MS);
        const today = usageDay(now());
        await batches.where('day').below(oldest).delete();
        await seen.where('day').below(oldest).delete();
        await first
          .where('day')
          .below(usageDay(now() - 30 * DAY_MS))
          .delete();
        let remaining = QUEUE_LIMIT - (await batches.count());
        for (const [day, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
          if (day < oldest || day > today || remaining <= 0) continue;
          const rows = new Map(delta.rows);
          const keys = [...delta.used];
          const returns = await first.bulkGet(keys);
          const updatedFirst: FirstUse[] = [];
          for (let index = 0; index < keys.length; index++) {
            const key = keys[index];
            const previous = returns[index];
            if (!previous || day < previous.day) {
              updatedFirst.push({ key, day });
              continue;
            }
            const daysSince = (Date.parse(day) - Date.parse(previous.day)) / DAY_MS;
            if (daysSince < 1 || daysSince > 30 || previous.returned) continue;
            rows.set(`return/${key}/${daysSince <= 7 ? 'week' : 'month'}`, 1);
            previous.returned = true;
            updatedFirst.push(previous);
          }
          // If the queue is full, discard the new delta together with its unique contributions.
          // IndexedDB serialises these tables across tabs, so only one batch claims each day/key.
          if (rows.size > remaining * USAGE_MAX_ROWS || !permitted()) continue;
          const entries = [...rows];
          const prior = await seen.bulkGet(entries.map(([key]) => [day, key]));
          const newlySeen: SeenMetric[] = [];
          const reportRows = entries.map(([key, count], index): UsageBatch['rows'][number] => {
            if (!prior[index]) newlySeen.push({ day, key });
            return [key, count, prior[index] ? 0 : 1];
          });
          const newBatches: UsageBatch[] = [];
          for (let start = 0; start < reportRows.length; start += USAGE_MAX_ROWS) {
            newBatches.push({
              day,
              id: crypto.randomUUID(),
              rows: reportRows.slice(start, start + USAGE_MAX_ROWS),
            });
          }
          if (!permitted()) return;
          await batches.bulkAdd(newBatches);
          await seen.bulkPut(newlySeen);
          await first.bulkPut(updatedFirst);
          remaining -= newBatches.length;
        }
      });
    },
    next() {
      return batches
        .where('day')
        .between(usageDay(now() - DAY_MS), usageDay(now()), true, true)
        .first();
    },
    acknowledge(id: string) {
      return batches.delete(id);
    },
    discard() {
      return batches.clear();
    },
    close() {
      database.close();
    },
  };
}

/** Check previously decided profiles for a pending queue without opening a new database. */
export async function discardExistingUsageBatches(): Promise<void> {
  const exists =
    typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).some(({ name }) => name === USAGE_DATABASE_NAME)
      : await Dexie.exists(USAGE_DATABASE_NAME);
  if (!exists) return;
  const outbox = createUsageOutbox();
  try {
    await outbox.discard();
  } finally {
    outbox.close();
  }
}
