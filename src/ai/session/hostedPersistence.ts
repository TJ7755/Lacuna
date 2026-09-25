import { z } from 'zod';
import {
  aiActionReceiptSchema,
  aiApprovalStateSchema,
  aiBridgeErrorSchema,
  aiEntityReferenceSchema,
} from '../protocol';
import { restoreState } from '../toolSession/state';
import type { AiToolSessionState } from '../toolSession';
import type { AiConversationItem } from './types';

export const HOSTED_SESSION_STORAGE_KEY = 'lacuna-ai-hosted-session-v1';
const MAX_STORED_BYTES = 300_000;
const identifier = z.string().min(1).max(100);
const timestamp = z.number().int().nonnegative();
const itemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'), id: identifier, content: z.string().max(12_000),
    createdAt: timestamp, delivery: z.enum(['queued', 'claimed', 'completed', 'stopped']),
  }).strict(),
  z.object({
    kind: z.literal('assistant'), id: identifier, content: z.string().max(50_000),
    createdAt: timestamp, sources: z.array(aiEntityReferenceSchema).max(100),
    progress: z.enum(['streaming', 'completed', 'interrupted']).optional(),
  }).strict(),
  z.object({ kind: z.literal('receipt'), id: identifier, receipt: aiActionReceiptSchema }).strict(),
  z.object({ kind: z.literal('error'), id: identifier, error: aiBridgeErrorSchema, createdAt: timestamp }).strict(),
]);
const storedSchema = z.object({
  version: z.literal(1),
  conversationId: identifier.nullable(),
  items: z.array(itemSchema).max(100),
  draft: z.string().max(12_000),
  queuedFollowUp: z.string().max(12_000).nullable(),
  approval: aiApprovalStateSchema.nullable(),
  toolState: z.unknown(),
}).strict();

export interface HostedStoredState {
  conversationId: string | null;
  items: AiConversationItem[];
  draft: string;
  queuedFollowUp: string | null;
  approval: z.infer<typeof aiApprovalStateSchema> | null;
  toolState: AiToolSessionState;
}

export interface HostedSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadHostedState(storage: HostedSessionStorage): HostedStoredState | null {
  try {
    const raw = storage.getItem(HOSTED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > MAX_STORED_BYTES) throw new Error('Stored AI session is too large.');
    const parsed = storedSchema.parse(JSON.parse(raw) as unknown);
    const items = parsed.items.map((item) => {
      if (item.kind === 'assistant' && item.progress === 'streaming') {
        return { ...item, progress: 'interrupted' as const };
      }
      if (item.kind === 'user' && item.delivery === 'claimed') {
        return { ...item, delivery: 'stopped' as const };
      }
      return item;
    });
    return {
      conversationId: parsed.conversationId,
      items,
      draft: parsed.queuedFollowUp ?? parsed.draft,
      queuedFollowUp: null,
      approval: null,
      toolState: restoreState(parsed.toolState),
    };
  } catch {
    try { storage.removeItem(HOSTED_SESSION_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function saveHostedState(storage: HostedSessionStorage, state: HostedStoredState): void {
  try {
    const encoded = JSON.stringify({ version: 1, ...state });
    if (encoded.length <= MAX_STORED_BYTES) storage.setItem(HOSTED_SESSION_STORAGE_KEY, encoded);
  } catch {
    // A full browser store must not interrupt an active response.
  }
}
