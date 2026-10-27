import Dexie, { type Table } from 'dexie';
import { JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD } from './diagnosis';
import {
  JEV_MODEL,
  JEV_TYPED_FEEDBACK_VERSION,
  JEV_TYPED_CORRECT_THRESHOLD,
  JEV_TYPED_INCORRECT_THRESHOLD,
  JEV_TYPED_KIND_CONFIDENCE_THRESHOLD,
  JEV_TYPED_PART_COVERED_THRESHOLD,
  JEV_TYPED_PART_NOT_COVERED_THRESHOLD,
  jevDecisionResultSchema,
  type JevDecisionRequest,
  type JevDecisionResult,
} from './protocol';

interface CacheEntry {
  hash: string;
  result: JevDecisionResult;
  usedAt: number;
}
// Separate database: device cache must never enter the application backup/sync snapshot.
class JevCache extends Dexie {
  entries!: Table<CacheEntry, string>;
  constructor() {
    super('lacuna-jev-cache');
    this.version(1).stores({ entries: 'hash,usedAt' });
  }
}
const disk = new JevCache();
export async function decisionHash(request: JevDecisionRequest): Promise<string> {
  const policy =
    request.purpose === 'typed-equivalence'
      ? {
          feedbackVersion: JEV_TYPED_FEEDBACK_VERSION,
          correct: JEV_TYPED_CORRECT_THRESHOLD,
          incorrect: JEV_TYPED_INCORRECT_THRESHOLD,
          kind: JEV_TYPED_KIND_CONFIDENCE_THRESHOLD,
          covered: JEV_TYPED_PART_COVERED_THRESHOLD,
          notCovered: JEV_TYPED_PART_NOT_COVERED_THRESHOLD,
        }
      : request.diagnostic
        ? { marking: 1, diagnosis: 1, confidence: JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD }
        : 1;
  const bytes = new TextEncoder().encode(JSON.stringify([JEV_MODEL, policy, request]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export interface JevDecisionCache {
  get(hash: string): Promise<JevDecisionResult | undefined>;
  put(hash: string, result: JevDecisionResult): Promise<void>;
}
export function createJevDecisionCache(): JevDecisionCache {
  const memory = new Map<string, JevDecisionResult>();
  return {
    async get(hash) {
      const hit = memory.get(hash);
      if (hit) {
        memory.delete(hash);
        memory.set(hash, hit);
        return hit;
      }
      try {
        const row = await disk.entries.get(hash);
        const parsed = jevDecisionResultSchema.safeParse(row?.result);
        if (
          parsed.success &&
          (parsed.data.value !== null || parsed.data.feedback || parsed.data.diagnosis)
        ) {
          await this.put(hash, parsed.data);
          return parsed.data;
        }
      } catch {
        /* Cache failure must not prevent marking. */
      }
      return undefined;
    },
    async put(hash, result) {
      if (result.value === null && !result.feedback && !result.diagnosis) return;
      memory.delete(hash);
      memory.set(hash, result);
      if (memory.size > 128) memory.delete(memory.keys().next().value!);
      try {
        await disk.transaction('rw', disk.entries, async () => {
          await disk.entries.put({ hash, result, usedAt: Date.now() });
          const excess = (await disk.entries.count()) - 512;
          if (excess > 0) await disk.entries.orderBy('usedAt').limit(excess).delete();
        });
      } catch {
        /* Private browsing and full disks may refuse IndexedDB. */
      }
    },
  };
}
export const jevDecisionCache = createJevDecisionCache();
