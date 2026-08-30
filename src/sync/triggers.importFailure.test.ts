import { beforeEach, expect, it, vi } from 'vitest';
import { installSyncTriggers, __resetTriggersForTests } from './triggers';

const { loadPairingMock, readSyncStateMock } = vi.hoisted(() => ({
  loadPairingMock: vi.fn(),
  readSyncStateMock: vi.fn(),
}));

vi.mock('../db/mutationStamp', () => ({ readSyncState: readSyncStateMock }));
vi.mock('./loaders', () => ({ loadSyncPairing: loadPairingMock }));

beforeEach(() => {
  __resetTriggersForTests();
  readSyncStateMock.mockResolvedValue({
    relayUrl: 'https://custom-relay.example',
    channelId: '0123456789abcdef0123456789abcdef',
    wrappedKeyMaterial: 'aa'.repeat(162),
    remembered: { channelKeyHex: 'bb'.repeat(32), writeToken: 'cc'.repeat(32) },
  });
  loadPairingMock.mockRejectedValue(new Error('Pairing chunk unavailable'));
});

it('contains a failed remembered-credential module load', async () => {
  const dispose = installSyncTriggers();

  await vi.waitFor(() => expect(loadPairingMock).toHaveBeenCalledOnce());
  await Promise.resolve();

  dispose();
});
