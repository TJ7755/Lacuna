import Dexie, { type Table } from 'dexie';
import { JEV_MODEL, jevDecisionResultSchema, type JevDecisionRequest, type JevDecisionResult } from './protocol';

interface CacheEntry { hash: string; result: JevDecisionResult; usedAt: number }
// Separate database: device cache must never enter the application backup/sync snapshot.
class JevCache extends Dexie {
  entries!: Table<CacheEntry, string>;
  constructor() { super('lacuna-jev-cache'); this.version(1).stores({ entries: 'hash,usedAt' }); }
}
const disk = new JevCache();
const memory = new Map<string, JevDecisionResult>();
export async function decisionHash(request: JevDecisionRequest): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([JEV_MODEL, 1, request]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export interface JevDecisionCache {
  get(hash: string): Promise<JevDecisionResult | undefined>;
  put(hash: string, result: JevDecisionResult): Promise<void>;
}
export const jevDecisionCache: JevDecisionCache = {
  async get(hash) {
    const hit = memory.get(hash);
    if (hit) { memory.delete(hash); memory.set(hash, hit); return hit; }
    try {
      const row = await disk.entries.get(hash);
      const parsed = jevDecisionResultSchema.safeParse(row?.result);
      if (parsed.success && parsed.data.value !== null) {
        await this.put(hash, parsed.data);
        return parsed.data;
      }
    } catch { /* Cache failure must not prevent marking. */ }
    return undefined;
  },
  async put(hash, result) {
    if (result.value === null) return;
    memory.delete(hash); memory.set(hash, result);
    if (memory.size > 128) memory.delete(memory.keys().next().value!);
    try {
      await disk.transaction('rw', disk.entries, async () => {
        await disk.entries.put({ hash, result, usedAt: Date.now() });
        const excess = await disk.entries.count() - 512;
        if (excess > 0) await disk.entries.orderBy('usedAt').limit(excess).delete();
      });
    } catch { /* Private browsing and full disks may refuse IndexedDB. */ }
  },
};
