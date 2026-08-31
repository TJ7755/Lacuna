import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiSession } from './types';

const runtime = vi.hoisted(() => {
  const unregister = vi.fn();
  const activate = vi.fn();
  const dispose = vi.fn();
  const relaySession = {
    activate,
    dispose,
    replacementParticipant: {},
  } as unknown as AiSession & { replacementParticipant: object };
  const localSession = {
    activate,
    dispose,
    replacementParticipant: {},
  } as unknown as AiSession & { replacementParticipant: object };
  return {
    relaySession,
    localSession,
    activate,
    dispose,
    unregister,
    register: vi.fn(() => unregister),
    createRelayAiSession: vi.fn(() => relaySession),
    createLocalAiSession: vi.fn(() => localSession),
    createElectronLocalAiRequestSource: vi.fn(() => ({})),
  };
});

vi.mock('./relay', () => ({ createRelayAiSession: runtime.createRelayAiSession }));
vi.mock('./local', () => ({ createLocalAiSession: runtime.createLocalAiSession }));
vi.mock('./localIpc', () => ({
  createElectronLocalAiRequestSource: runtime.createElectronLocalAiRequestSource,
}));
vi.mock('../relayClient', () => ({ createRelayClient: vi.fn(() => ({})) }));
vi.mock('../settings', () => ({ readAiSettings: vi.fn(() => ({})) }));
vi.mock('../instructions', () => ({ buildAiInstructionBundle: vi.fn(() => ({})) }));
vi.mock('../../db/replacementLifecycle', () => ({
  replacementLifecycle: { register: runtime.register },
}));

import { EnabledAiRuntime } from './EnabledAiRuntime';

describe('EnabledAiRuntime', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0',
    });
    vi.clearAllMocks();
  });

  it('publishes an active relay session on the web and clears it before disposal', async () => {
    const onSessionChange = vi.fn();
    const view = render(<EnabledAiRuntime onSessionChange={onSessionChange} />);

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(runtime.relaySession));
    expect(runtime.register).toHaveBeenCalledWith(runtime.relaySession.replacementParticipant);
    expect(runtime.createRelayAiSession).toHaveBeenCalledOnce();
    expect(runtime.createLocalAiSession).not.toHaveBeenCalled();
    expect(runtime.activate).toHaveBeenCalledOnce();

    view.unmount();

    expect(onSessionChange).toHaveBeenLastCalledWith(null);
    expect(runtime.unregister).toHaveBeenCalledOnce();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(onSessionChange.mock.invocationCallOrder.at(-1)).toBeLessThan(
      runtime.dispose.mock.invocationCallOrder[0]!,
    );
  });

  it('uses only the direct local session in Electron', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true },
    });
    const onSessionChange = vi.fn();
    const view = render(<EnabledAiRuntime onSessionChange={onSessionChange} />);

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(runtime.localSession));
    expect(runtime.createElectronLocalAiRequestSource).toHaveBeenCalledOnce();
    expect(runtime.createLocalAiSession).toHaveBeenCalledWith({
      source: {},
      getInstructions: expect.any(Function),
    });
    expect(runtime.createRelayAiSession).not.toHaveBeenCalled();

    view.unmount();
    expect(onSessionChange).toHaveBeenLastCalledWith(null);
  });

  it('fails closed to the local session when the Electron preload is unavailable', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Electron/42.3.3',
    });
    const onSessionChange = vi.fn();
    const view = render(<EnabledAiRuntime onSessionChange={onSessionChange} />);

    await waitFor(() => expect(onSessionChange).toHaveBeenCalledWith(runtime.localSession));
    expect(runtime.createLocalAiSession).toHaveBeenCalledOnce();
    expect(runtime.createRelayAiSession).not.toHaveBeenCalled();

    view.unmount();
  });
});
