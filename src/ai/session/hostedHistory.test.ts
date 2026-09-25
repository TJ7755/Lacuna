import { expect, it } from 'vitest';
import { createHostedAiSession } from './hosted';
import { saveHostedState } from './hostedPersistence';
import { parseHostedRequest } from '../hostedProtocol';
import type { AiConversationItem } from './types';

it('sends a valid bounded request after long but permitted conversation turns', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
  const items: AiConversationItem[] = Array.from({ length: 10 }, (_, index) => index % 2 === 0
    ? { kind: 'user', id: `user-${index}`, content: 'x'.repeat(12000), createdAt: index, delivery: 'completed' }
    : { kind: 'assistant', id: `assistant-${index}`, content: 'x'.repeat(12000), createdAt: index, sources: [], progress: 'completed' });
  saveHostedState(storage, { conversationId: 'conversation', items, draft: '', queuedFollowUp: null,
    approval: null, toolState: { grants: [], approvals: [], ledger: [] } });
  let body = '';
  const session = createHostedAiSession({ storage, acquireOwnership: async () => () => {},
    transport: { exchange: async () => ({ token: 'token', expiresAt: Date.now() + 3600000 }),
      async *infer(request) { body = JSON.stringify(request); yield { type: 'text_delta', text: 'Answer' }; yield { type: 'completed', finishReason: 'stop' }; } } });
  session.activate();
  await Promise.resolve();
  await session.connectHosted!('a'.repeat(32));
  await session.send('Next question');
  await new Promise((resolve) => setTimeout(resolve, 20));
  session.dispose();
  expect(body.length).toBeGreaterThan(0);
  expect(() => parseHostedRequest(body)).not.toThrow();
});
