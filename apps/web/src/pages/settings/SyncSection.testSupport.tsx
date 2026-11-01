import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import type { SyncState } from '@lacuna/core/db/types';

const animateDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
beforeAll(() => Reflect.deleteProperty(Element.prototype, 'animate'));
afterAll(() => {
  if (animateDescriptor) Object.defineProperty(Element.prototype, 'animate', animateDescriptor);
});

const {
  readSyncStateMock,
  setupFirstDeviceMock,
  joinFromPairingCodeMock,
  joinWithPassphraseMock,
  syncWithPassphraseMock,
  syncWithCredentialsMock,
  unlockSyncStateMock,
  unpairMock,
  deleteChannelMock,
  validateRecoveryPassphraseMock,
  encodePairingCodeMock,
  readRememberedCredentialsMock,
  forgetRememberedCredentialsMock,
  publishUnlockedCredentialsMock,
  clearUnlockedCredentialsMock,
  loadSyncPairingMock,
  notify,
} = vi.hoisted(() => ({
  readSyncStateMock: vi.fn(),
  setupFirstDeviceMock: vi.fn(),
  joinFromPairingCodeMock: vi.fn(),
  joinWithPassphraseMock: vi.fn(),
  syncWithPassphraseMock: vi.fn(),
  syncWithCredentialsMock: vi.fn(),
  unlockSyncStateMock: vi.fn(),
  unpairMock: vi.fn(),
  deleteChannelMock: vi.fn(),
  validateRecoveryPassphraseMock: vi.fn(),
  encodePairingCodeMock: vi.fn(),
  readRememberedCredentialsMock: vi.fn(),
  forgetRememberedCredentialsMock: vi.fn(),
  publishUnlockedCredentialsMock: vi.fn(),
  clearUnlockedCredentialsMock: vi.fn(),
  loadSyncPairingMock: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../../db/mutationStamp', () => ({ readSyncState: readSyncStateMock }));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

vi.mock('react-qr-code', () => ({
  default: ({ value }: { value: string }) => <div data-testid="sync-pairing-qr">{value}</div>,
}));

vi.mock('../../sync/pairing', () => ({
  DEFAULT_RELAY_URL: 'https://relay.example',
  decodePairingCode: vi.fn(),
  deleteChannel: deleteChannelMock,
  encodePairingCode: encodePairingCodeMock,
  forgetRememberedCredentials: forgetRememberedCredentialsMock,
  joinFromPairingCode: joinFromPairingCodeMock,
  joinWithPassphrase: joinWithPassphraseMock,
  readRememberedCredentials: readRememberedCredentialsMock,
  setupFirstDevice: setupFirstDeviceMock,
  syncWithCredentials: syncWithCredentialsMock,
  syncWithPassphrase: syncWithPassphraseMock,
  unpair: unpairMock,
  unlockSyncState: unlockSyncStateMock,
  validateRecoveryPassphrase: validateRecoveryPassphraseMock,
}));

vi.mock('../../sync/credentials', () => ({
  forgetRememberedCredentials: forgetRememberedCredentialsMock,
  readRememberedCredentials: readRememberedCredentialsMock,
}));

vi.mock('../../sync/pairingConfig', () => ({
  DEFAULT_RELAY_URL: 'https://relay.example',
  validateRecoveryPassphrase: validateRecoveryPassphraseMock,
}));

vi.mock('../../sync/loaders', () => ({ loadSyncPairing: loadSyncPairingMock }));

vi.mock('../../sync/triggers', () => ({
  publishUnlockedCredentials: publishUnlockedCredentialsMock,
  clearUnlockedCredentials: clearUnlockedCredentialsMock,
}));

export const state: SyncState = {
  relayUrl: 'https://relay.example',
  channelId: '0123456789abcdef0123456789abcdef',
  wrappedKeyMaterial: 'aa'.repeat(162),
  lastSuccessfulSyncAt: new Date('2026-08-18T12:00:00Z').getTime(),
  lastSnapshotBytes: 2_000_000,
  lastSnapshotPlaintextBytes: 1_800_000,
  lastError: null,
};

export const credentials = {
  relayUrl: state.relayUrl,
  channelId: state.channelId,
  channelKey: new Uint8Array(32),
  writeToken: 'bb'.repeat(32),
};

const session = {
  credentials,
  pairingCode: 'pairing-code',
  result: {
    attempts: 1,
    pulled: false,
    pushed: true,
    snapshotBytes: 100,
    snapshotPlaintextBytes: 80,
    generation: '"state-1"',
    mergeSummary: null,
    size: { plaintextBytes: 80, transportBytes: 100, limitBytes: 4_500_000, courseNames: [] },
  },
  state,
};

beforeEach(() => {
  readSyncStateMock.mockReset().mockResolvedValue(undefined);
  setupFirstDeviceMock.mockReset().mockResolvedValue(session);
  joinFromPairingCodeMock.mockReset().mockResolvedValue(session);
  joinWithPassphraseMock.mockReset().mockResolvedValue(session);
  syncWithPassphraseMock.mockReset().mockResolvedValue(session);
  unlockSyncStateMock.mockReset().mockResolvedValue(credentials);
  unpairMock.mockReset().mockResolvedValue(undefined);
  deleteChannelMock.mockReset().mockResolvedValue(undefined);
  syncWithCredentialsMock.mockReset().mockResolvedValue(session);
  readRememberedCredentialsMock.mockReset().mockReturnValue(null);
  forgetRememberedCredentialsMock.mockReset().mockResolvedValue(undefined);
  publishUnlockedCredentialsMock.mockReset();
  clearUnlockedCredentialsMock.mockReset();
  loadSyncPairingMock.mockReset().mockResolvedValue({
    decodePairingCode: vi.fn(),
    deleteChannel: deleteChannelMock,
    encodePairingCode: encodePairingCodeMock,
    joinFromPairingCode: joinFromPairingCodeMock,
    joinWithPassphrase: joinWithPassphraseMock,
    setupFirstDevice: setupFirstDeviceMock,
    syncWithCredentials: syncWithCredentialsMock,
    syncWithPassphrase: syncWithPassphraseMock,
    unpair: unpairMock,
    unlockSyncState: unlockSyncStateMock,
  });
  validateRecoveryPassphraseMock
    .mockReset()
    .mockImplementation((value: string) =>
      value.trim().length >= 16 ? null : 'Enter a recovery passphrase.',
    );
  encodePairingCodeMock.mockReset().mockReturnValue('pairing-code');
  notify.mockReset();
});

export {
  readSyncStateMock,
  setupFirstDeviceMock,
  joinWithPassphraseMock,
  syncWithPassphraseMock,
  syncWithCredentialsMock,
  unlockSyncStateMock,
  unpairMock,
  deleteChannelMock,
  readRememberedCredentialsMock,
  forgetRememberedCredentialsMock,
  publishUnlockedCredentialsMock,
  clearUnlockedCredentialsMock,
  loadSyncPairingMock,
  notify,
};
