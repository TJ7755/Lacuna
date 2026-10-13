import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PairingPayload } from '../../sync/pairing';
import { SyncPairingFlow, type SyncPairingMode } from './SyncPairingFlow';

const { decodePairingCode, scannerStart, scannerStop } = vi.hoisted(() => ({
  decodePairingCode: vi.fn(),
  scannerStart: vi.fn(),
  scannerStop: vi.fn(),
}));

vi.mock('../../sync/loaders', () => ({
  loadSyncPairing: () => Promise.resolve({ decodePairingCode }),
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    start = scannerStart;
    stop = scannerStop;
    clear = vi.fn();
  },
}));

const passphrase = 'correct horse battery staple';
const channelId = '0123456789abcdef0123456789abcdef';
const payload = { relayUrl: 'https://relay.example' } as PairingPayload;

function renderFlow(mode: SyncPairingMode) {
  const props = {
    onSetup: vi.fn().mockResolvedValue(undefined),
    onManualJoin: vi.fn().mockResolvedValue(undefined),
    onQrJoin: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
  };
  render(<SyncPairingFlow mode={mode} busy={null} {...props} />);
  return props;
}

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SyncPairingFlow', () => {
  beforeEach(() => {
    scannerStop.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });
  afterEach(() => vi.resetAllMocks());

  describe('setup', () => {
    it('sets up sync with the default relay once the passphrases agree', async () => {
      const { onSetup } = renderFlow('setup');
      expect(screen.getByLabelText('Recovery passphrase')).toHaveFocus();
      type('Recovery passphrase', passphrase);
      type('Confirm recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
      await waitFor(() =>
        expect(onSetup).toHaveBeenCalledWith('https://relay.getlacuna.app', '', passphrase),
      );
    });

    it('flags a short or mismatched passphrase against its field', async () => {
      const { onSetup } = renderFlow('setup');
      type('Recovery passphrase', 'short');
      fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
      expect(await screen.findByText(/Use at least 16 characters for/)).toBeInTheDocument();
      expect(screen.getByLabelText('Recovery passphrase')).toHaveAttribute('aria-invalid', 'true');

      type('Recovery passphrase', passphrase);
      type('Confirm recovery passphrase', `${passphrase}!`);
      fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
      expect(await screen.findByText('The recovery passphrases do not match.')).toBeInTheDocument();
      expect(onSetup).not.toHaveBeenCalled();
    });

    it('opens the private relay fields when the relay rejects the setup', async () => {
      const { onSetup } = renderFlow('setup');
      onSetup.mockRejectedValueOnce(new Error('The relay URL could not be reached.'));
      type('Recovery passphrase', passphrase);
      type('Confirm recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
      expect(await screen.findByText('The relay URL could not be reached.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide advanced' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByLabelText('Relay URL')).toHaveAttribute('aria-invalid', 'true');
    });

    it('cancels on Escape', () => {
      const { onCancel } = renderFlow('setup');
      fireEvent.keyDown(screen.getByLabelText('Recovery passphrase'), { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual join', () => {
    function openManual() {
      const props = renderFlow('join');
      fireEvent.click(screen.getByRole('radio', { name: 'Enter details' }));
      return props;
    }

    it('joins with a trimmed channel id', async () => {
      const { onManualJoin } = openManual();
      expect(screen.getByLabelText('Channel id')).toHaveFocus();
      type('Channel id', ` ${channelId} `);
      type('Recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
      await waitFor(() =>
        expect(onManualJoin).toHaveBeenCalledWith(
          'https://relay.getlacuna.app',
          channelId,
          passphrase,
        ),
      );
    });

    it('rejects a malformed channel id before contacting the relay', async () => {
      const { onManualJoin } = openManual();
      type('Channel id', 'ABC');
      type('Recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
      expect(
        await screen.findByText('Enter the 32-character channel id from your other device.'),
      ).toBeInTheDocument();
      expect(onManualJoin).not.toHaveBeenCalled();
    });

    it('shows an unexplained failure as a form error and clears it on edit', async () => {
      const { onManualJoin } = openManual();
      onManualJoin.mockRejectedValueOnce('offline');
      type('Channel id', channelId);
      type('Recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
      expect(
        await screen.findByText('Could not join. Check your details and try again.'),
      ).toBeInTheDocument();
      type('Recovery passphrase', `${passphrase}!`);
      expect(
        screen.queryByText('Could not join. Check your details and try again.'),
      ).not.toBeInTheDocument();
    });
  });

  describe('QR join', () => {
    it('scans a pairing code and joins with it', async () => {
      decodePairingCode.mockReturnValue(payload);
      scannerStart.mockImplementation(
        async (_camera: unknown, _config: unknown, onDecoded: (text: string) => Promise<void>) =>
          onDecoded('lacuna-pairing-code'),
      );
      const { onQrJoin } = renderFlow('join');
      fireEvent.click(screen.getByRole('button', { name: 'Scan pairing QR' }));

      expect(await screen.findByText('https://relay.example')).toBeInTheDocument();
      expect(decodePairingCode).toHaveBeenCalledWith('lacuna-pairing-code');
      expect(scannerStop).toHaveBeenCalled();
      await waitFor(() => expect(screen.getByLabelText('Your recovery passphrase')).toHaveFocus());

      type('Your recovery passphrase', passphrase);
      fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
      await waitFor(() => expect(onQrJoin).toHaveBeenCalledWith(payload, passphrase));
    });

    it('reports a code that is not a pairing code', async () => {
      decodePairingCode.mockImplementation(() => {
        throw new Error('This QR code is not a Lacuna sync pairing code.');
      });
      scannerStart.mockImplementation(
        async (_camera: unknown, _config: unknown, onDecoded: (text: string) => Promise<void>) =>
          onDecoded('https://example.com'),
      );
      renderFlow('join');
      fireEvent.click(screen.getByRole('button', { name: 'Scan pairing QR' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This QR code is not a Lacuna sync pairing code.',
      );
      expect(screen.getByRole('button', { name: 'Scan pairing QR' })).toBeInTheDocument();
    });

    it('reports a camera that will not start', async () => {
      scannerStart.mockRejectedValue(new Error('Permission denied'));
      renderFlow('join');
      fireEvent.click(screen.getByRole('button', { name: 'Scan pairing QR' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
      expect(scannerStop).toHaveBeenCalled();
    });

    it('stops an in-progress scan on request', async () => {
      scannerStart.mockReturnValue(new Promise(() => {}));
      renderFlow('join');
      fireEvent.click(screen.getByRole('button', { name: 'Scan pairing QR' }));
      await waitFor(() => expect(scannerStart).toHaveBeenCalled());
      fireEvent.click(screen.getByRole('button', { name: 'Stop scanning' }));
      expect(screen.queryByText('Point the camera at the pairing QR.')).not.toBeInTheDocument();
      await waitFor(() => expect(scannerStop).toHaveBeenCalled());
    });

    it('disables scanning without a camera', () => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      renderFlow('join');
      expect(screen.getByRole('button', { name: 'Scan pairing QR' })).toBeDisabled();
      expect(
        screen.getByText('Camera scanning is unavailable in this browser.'),
      ).toBeInTheDocument();
    });
  });
});
