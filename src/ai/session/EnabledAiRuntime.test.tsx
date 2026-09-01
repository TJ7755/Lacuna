import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplacementParticipant } from '../../db/replacementLifecycle';
import type { AiSession } from './types';

const runtime = vi.hoisted(() => {
  const unregister = vi.fn();
  const activate = vi.fn();
  const dispose = vi.fn();
  const relaySession = {
    activate,
    dispose,
    replacementParticipant: {},
  } as unknown as AiSession & { replacementParticipant: ReplacementParticipant };
  const localSession = {
    activate,
    dispose,
    replacementParticipant: {},
  } as unknown as AiSession & { replacementParticipant: ReplacementParticipant };
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

  it('publishes an active relay session on the web and unregisters it on unmount', async () => {
    const onSessionReady = vi.fn();
    const view = render(
      <EnabledAiRuntime retainedSession={null} onSessionReady={onSessionReady} />,
    );

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledWith(runtime.relaySession));
    expect(runtime.register).toHaveBeenCalledWith(runtime.relaySession.replacementParticipant);
    expect(runtime.createRelayAiSession).toHaveBeenCalledOnce();
    expect(runtime.createLocalAiSession).not.toHaveBeenCalled();
    expect(runtime.activate).toHaveBeenCalledOnce();

    view.unmount();

    expect(runtime.unregister).toHaveBeenCalledOnce();
    expect(runtime.dispose).not.toHaveBeenCalled();
  });

  it('uses only the direct local session in Electron', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true },
    });
    const onSessionReady = vi.fn();
    const view = render(
      <EnabledAiRuntime retainedSession={null} onSessionReady={onSessionReady} />,
    );

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledWith(runtime.localSession));
    expect(runtime.createElectronLocalAiRequestSource).toHaveBeenCalledOnce();
    expect(runtime.createLocalAiSession).toHaveBeenCalledWith({
      source: {},
      getInstructions: expect.any(Function),
    });
    expect(runtime.createRelayAiSession).not.toHaveBeenCalled();

    view.unmount();
  });

  it('retains the direct local session across a runtime remount', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true },
    });
    const onSessionReady = vi.fn();
    const first = render(
      <EnabledAiRuntime retainedSession={null} onSessionReady={onSessionReady} />,
    );

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledWith(runtime.localSession));
    first.unmount();

    const second = render(
      <EnabledAiRuntime onSessionReady={onSessionReady} retainedSession={runtime.localSession} />,
    );

    await waitFor(() => expect(runtime.activate).toHaveBeenCalledTimes(2));
    expect(runtime.createLocalAiSession).toHaveBeenCalledOnce();
    expect(runtime.dispose).not.toHaveBeenCalled();

    second.unmount();
  });

  it('fails closed to the local session when the Electron preload is unavailable', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 Electron/42.3.3',
    });
    const onSessionReady = vi.fn();
    const view = render(
      <EnabledAiRuntime retainedSession={null} onSessionReady={onSessionReady} />,
    );

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledWith(runtime.localSession));
    expect(runtime.createLocalAiSession).toHaveBeenCalledOnce();
    expect(runtime.createRelayAiSession).not.toHaveBeenCalled();

    view.unmount();
  });
});
