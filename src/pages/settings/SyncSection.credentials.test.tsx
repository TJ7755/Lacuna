import './SyncSection.testSupport';
import {
  credentials,
  loadSyncPairingMock,
  readRememberedCredentialsMock,
  readSyncStateMock,
  state,
  syncWithCredentialsMock,
  syncWithPassphraseMock,
  unlockSyncStateMock,
} from './SyncSection.testSupport';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { describe, expect, it, vi } from 'vitest';
import { SyncSection } from './SyncSection';

describe('SyncSection credentials', () => {
  it('returns failed unlock focus to a persistently described passphrase field', async () => {
    readSyncStateMock.mockResolvedValue(state);
    syncWithPassphraseMock.mockRejectedValueOnce(new Error('Incorrect recovery passphrase.'));
    render(<SyncSection />);
    const passphrase = await screen.findByLabelText('Recovery passphrase');
    fireEvent.change(passphrase, { target: { value: 'an incorrect recovery phrase' } });
    screen.getByRole('button', { name: 'Sync now' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(passphrase).toHaveAttribute('aria-invalid', 'true'));
    expect(passphrase).toHaveFocus();
    expect(passphrase).toHaveAccessibleDescription('Incorrect recovery passphrase.');
  });

  it('keeps failed action preloads retryable without an unhandled rejection', async () => {
    readSyncStateMock.mockResolvedValue(state);
    loadSyncPairingMock
      .mockRejectedValueOnce(new Error('pairing chunk unavailable'))
      .mockResolvedValue({ syncWithCredentials: syncWithCredentialsMock });
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    try {
      render(<SyncSection />);

      const button = await screen.findByRole('button', { name: 'Sync now' });
      fireEvent.pointerEnter(button);
      fireEvent.pointerEnter(button);

      await waitFor(() => expect(loadSyncPairingMock).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('retries a failed QR preload without leaving a rejected promise behind', async () => {
    readSyncStateMock.mockResolvedValue(state);
    loadSyncPairingMock
      .mockRejectedValueOnce(new Error('pairing chunk unavailable'))
      .mockResolvedValue({ syncWithCredentials: syncWithCredentialsMock });
    render(<SyncSection />);

    const button = await screen.findByRole('button', { name: 'Show pairing QR' });
    fireEvent.pointerEnter(button);
    fireEvent.pointerEnter(button);

    await waitFor(() => expect(loadSyncPairingMock).toHaveBeenCalledTimes(2));
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

  it('collapses an inert QR on dismissal but removes its key immediately on window blur during exit', async () => {
    readSyncStateMock.mockResolvedValue(state);
    readRememberedCredentialsMock.mockReturnValue(credentials);
    render(
      <LazyMotion features={domAnimation}>
        <SyncSection />
      </LazyMotion>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Show pairing QR' }));
    const qr = await screen.findByTestId('sync-pairing-qr');
    fireEvent.click(screen.getByRole('button', { name: 'Hide pairing QR' }));
    expect(qr).toBeInTheDocument();
    expect(qr.closest('[inert]')).not.toBeNull();
    fireEvent(window, new Event('blur'));
    expect(qr).not.toBeInTheDocument();
  });

  it('keeps channel details behind the encryption disclosure and errors visible', async () => {
    readSyncStateMock.mockResolvedValue({ ...state, lastError: 'Relay unavailable' });
    readRememberedCredentialsMock.mockReturnValue(credentials);
    render(
      <LazyMotion features={domAnimation}>
        <SyncSection />
      </LazyMotion>,
    );
    await screen.findByText('Paired to a sync channel');

    const details = screen.getByRole('button', { name: 'End-to-end encrypted' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent('Relay unavailable');
    expect(screen.getByRole('button', { name: 'Lock' })).toHaveAttribute(
      'title',
      'Unlocked — this device remembers its key, so sync works without the passphrase.',
    );
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByText(state.relayUrl!)).toBeVisible());
    expect(screen.getByText(state.channelId!)).toBeVisible();
    expect(screen.getByText(/Last snapshot: 2.00 MB encrypted/)).toBeVisible();
  });

  it('starts unlocked from the remembered copy and syncs without the passphrase', async () => {
    readSyncStateMock.mockResolvedValue(state);
    readRememberedCredentialsMock.mockReturnValue(credentials);
    render(<SyncSection />);
    expect(await screen.findByText('Paired to a sync channel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Recovery passphrase')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    await waitFor(() => expect(syncWithCredentialsMock).toHaveBeenCalledWith(credentials));
    expect(unlockSyncStateMock).not.toHaveBeenCalled();
  });
});
