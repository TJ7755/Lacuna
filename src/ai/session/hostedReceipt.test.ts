import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import { createHostedAiSession } from './hosted';
import { AiToolSession } from '../toolSession';
import { HOSTED_SESSION_STORAGE_KEY } from './hostedPersistence';
it.each(['stop', 'dispose'] as const)('retains a committed receipt when %s occurs during the approved operation', async (interruption) => {
  let release!: () => void;
  let entered = false;
  let committed = false;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const values = new Map<string, string>();
  const toolSession = new AiToolSession({ digest: text => text, executeToolCall: async request => {
    entered = true;
    await blocked;
    committed = true;
    return { ok: true, result: { id: 'created-course', name: 'Course' }, receipt: {
      callId: request.callId, toolName: request.toolName, requiredScope: request.grant.scope,
      target: { courseId: request.grant.courseId }, completedAt: Date.now(),
    } };
  } });
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
  const session = createHostedAiSession({ toolSession, storage,
    acquireOwnership: async () => () => {},
    transport: { exchange: async () => ({ token: 't', expiresAt: Date.now() + 3600000 }), async *infer() {
      yield { type: 'tool_call', callId: 'c', name: 'lacuna.create_course', input: { name: 'Course' } };
      yield { type: 'completed', finishReason: 'tool_calls' };
    } },
  });
  session.activate(); await Promise.resolve(); await session.connectHosted!('credential');
  await session.send('Create course');
  await vi.waitFor(() => expect(session.getSnapshot().approval).not.toBeNull());
  await session.decide(session.getSnapshot().approval!.approvalId, true);
  await vi.waitFor(() => expect(entered).toBe(true));
  if (interruption === 'stop') await session.stop(session.getSnapshot().run!.runId);
  else session.dispose();
  release();
  await session.replacementParticipant.quiesce();
  expect(committed).toBe(true);
  expect(toolSession.exportState().ledger).toHaveLength(1);
  expect.soft(session.getSnapshot().items.filter(item => item.kind === 'receipt')).toHaveLength(1);
  expect.soft(JSON.parse(values.get(HOSTED_SESSION_STORAGE_KEY)!).toolState.ledger).toHaveLength(1);
  const reloaded = createHostedAiSession({ storage, toolSession: new AiToolSession({ digest: text => text }) });
  expect(reloaded.getSnapshot().items.filter(item => item.kind === 'receipt')).toHaveLength(1);
  expect(reloaded.getSnapshot().run).toBeNull();
});
