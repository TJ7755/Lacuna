import Dexie, { type Table } from 'dexie';
import { JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD } from '@lacuna/core/jev/diagnosis';
import {
  JEV_MODEL,
  JEV_ALLOCATION_PROMPT_VERSION,
  JEV_DIAGNOSTIC_PROMPT_VERSION,
  jevAllocationConfidenceThreshold,
  JEV_TYPED_FEEDBACK_VERSION,
  JEV_TYPED_CORRECT_THRESHOLD,
  JEV_TYPED_INCORRECT_THRESHOLD,
  JEV_TYPED_KIND_CONFIDENCE_THRESHOLD,
  JEV_TYPED_PART_COVERED_THRESHOLD,
  JEV_TYPED_PART_NOT_COVERED_THRESHOLD,
  jevDecisionResultSchema,
  type JevDecisionRequest,
  type JevDecisionResult,
  jevLessonDistractorResultSchema,
  type JevLessonDistractorResult,
} from './protocol';

interface CacheEntry {
  hash: string;
  result: JevDecisionResult;
  usedAt: number;
}
interface DistractorEntry {
  hash: string;
  result: JevLessonDistractorResult;
}

// Separate database: device cache must never enter the application backup/sync snapshot.
class JevCache extends Dexie {
  entries!: Table<CacheEntry, string>;
  distractors!: Table<DistractorEntry, string>;
  constructor() {
    super('lacuna-jev-cache');
    this.version(1).stores({ entries: 'hash,usedAt' });
    this.version(2).stores({ distractors: 'hash' });
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
        ? {
            marking: JEV_ALLOCATION_PROMPT_VERSION,
            markConfidence: jevAllocationConfidenceThreshold(request.maxMarks),
            diagnosis: JEV_DIAGNOSTIC_PROMPT_VERSION,
            confidence: JEV_DIAGNOSTIC_CONFIDENCE_THRESHOLD,
          }
        : {
            marking: JEV_ALLOCATION_PROMPT_VERSION,
            markConfidence: jevAllocationConfidenceThreshold(request.maxMarks),
          };
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

const distractorsInMemory = new Map<string, JevLessonDistractorResult>();
function rememberDistractors(hash: string, result: JevLessonDistractorResult) {
  distractorsInMemory.delete(hash);
  distractorsInMemory.set(hash, result);
  if (distractorsInMemory.size > 32)
    distractorsInMemory.delete(distractorsInMemory.keys().next().value!);
}

export const jevDistractorCache = {
  async get(hash: string): Promise<JevLessonDistractorResult | undefined> {
    const hit = distractorsInMemory.get(hash);
    if (hit) {
      rememberDistractors(hash, hit);
      return hit;
    }
    try {
      const row = await disk.distractors.get(hash);
      const parsed = jevLessonDistractorResultSchema.safeParse(row?.result);
      if (parsed.success) {
        rememberDistractors(hash, parsed.data);
        return parsed.data;
      }
    } catch {
      /* The device may deny cache access. */
    }
    return undefined;
  },
  async put(hash: string, result: JevLessonDistractorResult): Promise<void> {
    rememberDistractors(hash, result);
    try {
      await disk.distractors.put({ hash, result });
    } catch {
      /* The in-memory shortlist remains available. */
    }
  },
};
