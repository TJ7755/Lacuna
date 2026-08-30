import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../db/types';
import type { SyncCredentials } from './pairing';
import {
  __resetTriggersForTests,
  clearUnlockedCredentials,
  getUnlockedCredentials,
  installSyncTriggers,
  publishUnlockedCredentials,
} from './triggers';

const {
  allowRelayConnectMock,
  pairingModuleExecutions,
  readRememberedCredentialsMock,
  readSyncStateMock,
  syncWithCredentialsMock,
} = vi.hoisted(() => ({
    allowRelayConnectMock: vi.fn(),
    pairingModuleExecutions: { count: 0 },
    readRememberedCredentialsMock: vi.fn(),
    readSyncStateMock: vi.fn(),
    syncWithCredentialsMock: vi.fn(),
  }));

vi.mock('../db/mutationStamp', () => ({ readSyncState: readSyncStateMock }));
vi.mock('./csp', () => ({ allowRelayConnect: allowRelayConnectMock }));
vi.mock('./pairing', () => {
  pairingModuleExecutions.count += 1;
  return {
    readRememberedCredentials: readRememberedCredentialsMock,
    syncWithCredentials: syncWithCredentialsMock,
  };
});

const state: SyncState = {
  relayUrl: 'https://custom-relay.example',
  channelId: '0123456789abcdef0123456789abcdef',
  wrappedKeyMaterial: 'aa'.repeat(162),
  remembered: { channelKeyHex: 'bb'.repeat(32), writeToken: 'cc'.repeat(32) },
};

const credentials: SyncCredentials = {
  relayUrl: state.relayUrl!,
  channelId: state.channelId!,
  channelKey: new Uint8Array(32),
  writeToken: state.remembered!.writeToken,
};

beforeEach(() => {
  __resetTriggersForTests();
  allowRelayConnectMock.mockReset();
  readSyncStateMock.mockReset().mockResolvedValue(state);
  readRememberedCredentialsMock.mockReset().mockReturnValue(credentials);
  syncWithCredentialsMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe('remembered sync trigger credentials', () => {
  it('does not execute the pairing module when this device has no remembered credentials', async () => {
    readSyncStateMock.mockResolvedValue({ ...state, remembered: undefined });

    const dispose = installSyncTriggers();
    await vi.waitFor(() => expect(readSyncStateMock).toHaveBeenCalled());

    expect(pairingModuleExecutions.count).toBe(0);
    expect(readRememberedCredentialsMock).not.toHaveBeenCalled();
    dispose();
  });

  it('allows a remembered custom relay through the web CSP before publishing it', async () => {
    const dispose = installSyncTriggers();

    await vi.waitFor(() => expect(getUnlockedCredentials()).toBe(credentials));

    expect(allowRelayConnectMock).toHaveBeenCalledWith(credentials.relayUrl);
    dispose();
  });

  it('does not republish a stale restore after Lock clears the current credentials', async () => {
    let resolveRead: ((value: SyncState) => void) | undefined;
    readSyncStateMock.mockReturnValue(
      new Promise<SyncState>((resolve) => {
        resolveRead = resolve;
      }),
    );
    const dispose = installSyncTriggers();

    clearUnlockedCredentials();
    resolveRead?.(state);
    await vi.waitFor(() => expect(readRememberedCredentialsMock).toHaveBeenCalled());

    expect(getUnlockedCredentials()).toBeNull();
    dispose();
  });

  it.each([
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['study session completion', () => window.dispatchEvent(new Event('lacuna:study-session-end'))],
  ])('runs with credentials published by manual sync after %s', async (_name, trigger) => {
    vi.useFakeTimers();
    publishUnlockedCredentials(credentials);
    const dispose = installSyncTriggers();

    trigger();
    await vi.advanceTimersByTimeAsync(1500);

    expect(syncWithCredentialsMock).toHaveBeenCalledWith(credentials);
    dispose();
  });
});
