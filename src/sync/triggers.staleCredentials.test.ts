import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SyncCredentials } from './pairing';
import {
  __resetTriggersForTests,
  clearUnlockedCredentials,
  installSyncTriggers,
  publishUnlockedCredentials,
} from './triggers';

const { loadPairingMock, readSyncStateMock, syncWithCredentialsMock } = vi.hoisted(() => ({
  loadPairingMock: vi.fn(),
  readSyncStateMock: vi.fn(),
  syncWithCredentialsMock: vi.fn(),
}));

vi.mock('../db/mutationStamp', () => ({ readSyncState: readSyncStateMock }));
vi.mock('./loaders', () => ({ loadSyncPairing: loadPairingMock }));

const credentials: SyncCredentials = {
  relayUrl: 'https://custom-relay.example',
  channelId: '0123456789abcdef0123456789abcdef',
  channelKey: new Uint8Array(32),
  writeToken: 'cc'.repeat(32),
};

beforeEach(() => {
  vi.useFakeTimers();
  __resetTriggersForTests();
  readSyncStateMock.mockReset().mockResolvedValue({
    relayUrl: credentials.relayUrl,
    channelId: credentials.channelId,
    wrappedKeyMaterial: 'aa'.repeat(162),
  });
  loadPairingMock.mockReset();
  syncWithCredentialsMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

it.each([
  ['cleared', () => clearUnlockedCredentials()],
  [
    'replaced',
    () =>
      publishUnlockedCredentials({
        ...credentials,
        writeToken: 'dd'.repeat(32),
      }),
  ],
])('does not sync credentials %s while the pairing module loads', async (_label, change) => {
  let releaseModule!: (module: { syncWithCredentials: typeof syncWithCredentialsMock }) => void;
  loadPairingMock.mockReturnValue(
    new Promise((resolve) => {
      releaseModule = resolve;
    }),
  );
  publishUnlockedCredentials(credentials);
  const dispose = installSyncTriggers();

  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(1500);
  await vi.waitFor(() => expect(loadPairingMock).toHaveBeenCalledOnce());

  change();
  releaseModule({ syncWithCredentials: syncWithCredentialsMock });
  await Promise.resolve();

  expect(syncWithCredentialsMock).not.toHaveBeenCalled();
  dispose();
});
