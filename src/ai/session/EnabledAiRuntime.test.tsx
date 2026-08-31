import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSession } from './types';

const runtime = vi.hoisted(() => {
  const unregister = vi.fn();
  const activate = vi.fn();
  const dispose = vi.fn();
  const session = {
    activate,
    dispose,
    replacementParticipant: {},
  } as unknown as AiSession & { replacementParticipant: object };
  return {
    session,
    activate,
    dispose,
    unregister,
    register: vi.fn(() => unregister),
    createRelayAiSession: vi.fn(() => session),
  };
});

vi.mock('./relay', () => ({ createRelayAiSession: runtime.createRelayAiSession }));
vi.mock('../relayClient', () => ({ createRelayClient: vi.fn(() => ({})) }));
vi.mock('../settings', () => ({ readAiSettings: vi.fn(() => ({})) }));
vi.mock('../instructions', () => ({ buildAiInstructionBundle: vi.fn(() => ({})) }));
vi.mock('../../db/replacementLifecycle', () => ({
  replacementLifecycle: { register: runtime.register },
}));

import { EnabledAiRuntime } from './EnabledAiRuntime';

describe('EnabledAiRuntime', () => {
  it('publishes an active session and clears it before disposal', async () => {
    const onSessionChange = vi.fn();
    const view = render(<EnabledAiRuntime onSessionChange={onSessionChange} />);

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(runtime.session));
    expect(runtime.register).toHaveBeenCalledWith(runtime.session.replacementParticipant);
    expect(runtime.activate).toHaveBeenCalledOnce();

    view.unmount();

    expect(onSessionChange).toHaveBeenLastCalledWith(null);
    expect(runtime.unregister).toHaveBeenCalledOnce();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(onSessionChange.mock.invocationCallOrder.at(-1)).toBeLessThan(
      runtime.dispose.mock.invocationCallOrder[0]!,
    );
  });
});
