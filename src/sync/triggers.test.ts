import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../db/types';
import type { SyncCredentials } from './pairing';
import {
  __resetTriggersForTests,
  clearUnlockedCredentials,
  getUnlockedCredentials,
  installSyncTriggers,
} from './triggers';

const { allowRelayConnectMock, readRememberedCredentialsMock, readSyncStateMock } = vi.hoisted(
  () => ({
    allowRelayConnectMock: vi.fn(),
    readRememberedCredentialsMock: vi.fn(),
    readSyncStateMock: vi.fn(),
  }),
);

vi.mock('../db/mutationStamp', () => ({ readSyncState: readSyncStateMock }));
vi.mock('./csp', () => ({ allowRelayConnect: allowRelayConnectMock }));
vi.mock('./pairing', () => ({
  readRememberedCredentials: readRememberedCredentialsMock,
  syncWithCredentials: vi.fn(),
}));

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
});

describe('remembered sync trigger credentials', () => {
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
});
