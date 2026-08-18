import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../../db/types';
import { SyncSection } from './SyncSection';

const {
  readSyncStateMock,
  setupFirstDeviceMock,
  joinFromPairingCodeMock,
  joinWithPassphraseMock,
  syncWithPassphraseMock,
  unlockSyncStateMock,
  unpairMock,
  deleteChannelMock,
  validateRecoveryPassphraseMock,
  encodePairingCodeMock,
  notify,
} = vi.hoisted(() => ({
  readSyncStateMock: vi.fn(),
  setupFirstDeviceMock: vi.fn(),
  joinFromPairingCodeMock: vi.fn(),
  joinWithPassphraseMock: vi.fn(),
  syncWithPassphraseMock: vi.fn(),
  unlockSyncStateMock: vi.fn(),
  unpairMock: vi.fn(),
  deleteChannelMock: vi.fn(),
  validateRecoveryPassphraseMock: vi.fn(),
  encodePairingCodeMock: vi.fn(),
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
  joinFromPairingCode: joinFromPairingCodeMock,
  joinWithPassphrase: joinWithPassphraseMock,
  setupFirstDevice: setupFirstDeviceMock,
  syncWithPassphrase: syncWithPassphraseMock,
  unpair: unpairMock,
  unlockSyncState: unlockSyncStateMock,
  validateRecoveryPassphrase: validateRecoveryPassphraseMock,
}));

const state: SyncState = {
  relayUrl: 'https://relay.example',
  channelId: '0123456789abcdef0123456789abcdef',
  wrappedKeyMaterial: 'aa'.repeat(162),
  lastSuccessfulSyncAt: new Date('2026-08-18T12:00:00Z').getTime(),
  lastSnapshotBytes: 2_000_000,
  lastSnapshotPlaintextBytes: 1_800_000,
  lastError: null,
};

const credentials = {
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
  validateRecoveryPassphraseMock
    .mockReset()
    .mockImplementation((value: string) =>
      value.trim().length >= 16 ? null : 'Enter a recovery passphrase.',
    );
  encodePairingCodeMock.mockReset().mockReturnValue('pairing-code');
  notify.mockReset();
});

describe('SyncSection', () => {
  it('offers setup and joining when no channel is configured', async () => {
    render(<SyncSection />);

    expect(await screen.findByRole('heading', { name: 'Device sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join another device' })).toBeInTheDocument();
    expect(screen.getByText('No sync channel is configured on this device.')).toBeInTheDocument();
  });

  it('sets up the first device after confirming a strong passphrase', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));

    fireEvent.change(screen.getByLabelText('Relay mint secret'), {
      target: { value: 'mint-secret' },
    });
    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.change(screen.getByLabelText('Confirm recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));

    await waitFor(() =>
      expect(setupFirstDeviceMock).toHaveBeenCalledWith(
        'https://relay.example',
        'mint-secret',
        'a long recovery phrase',
      ),
    );
    expect(await screen.findByText('Paired to a sync channel')).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(
      'Sync is ready. Pair another device with the QR code.',
      'positive',
    );
  });

  it('keeps the pairing QR hidden until explicitly requested and unlocks it locally', async () => {
    readSyncStateMock.mockResolvedValue(state);
    render(<SyncSection />);
    expect(await screen.findByText('Paired to a sync channel')).toBeInTheDocument();
    expect(screen.queryByTestId('sync-pairing-qr')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show pairing QR' }));

    await waitFor(() =>
      expect(unlockSyncStateMock).toHaveBeenCalledWith(state, 'a long recovery phrase'),
    );
    expect(await screen.findByTestId('sync-pairing-qr')).toHaveTextContent('pairing-code');
  });

  it('keeps unpairing local and does not purge the shared channel', async () => {
    readSyncStateMock.mockResolvedValue(state);
    render(<SyncSection />);
    await screen.findByText('Paired to a sync channel');

    fireEvent.click(screen.getByRole('button', { name: 'Unpair this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    await waitFor(() => expect(unpairMock).toHaveBeenCalledTimes(1));
    expect(deleteChannelMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText('No sync channel is configured on this device.'),
    ).toBeInTheDocument();
  });

  it('requires the recovery passphrase before deleting the shared channel', async () => {
    readSyncStateMock.mockResolvedValue(state);
    render(<SyncSection />);
    await screen.findByText('Paired to a sync channel');

    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));
    expect(deleteChannelMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));

    await waitFor(() =>
      expect(deleteChannelMock).toHaveBeenCalledWith(state, 'a long recovery phrase'),
    );
    expect(
      await screen.findByText('No sync channel is configured on this device.'),
    ).toBeInTheDocument();
  });
});
