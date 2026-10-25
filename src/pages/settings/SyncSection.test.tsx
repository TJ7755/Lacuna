import './SyncSection.testSupport';
import {
  joinWithPassphraseMock,
  notify,
  readSyncStateMock,
  setupFirstDeviceMock,
  state,
} from './SyncSection.testSupport';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SyncState } from '../../db/types';
import { SyncSection } from './SyncSection';

describe('SyncSection', () => {
  it('keeps pairing methods in one keyboard stop while arrows retain choice focus', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join another device' }));
    const qr = await screen.findByRole('radio', { name: 'QR code' });
    qr.focus();
    fireEvent.keyDown(qr, { key: 'ArrowRight' });
    const manual = screen.getByRole('radio', { name: 'Enter details' });
    expect(manual).toHaveFocus();
    expect(manual).toHaveAttribute('aria-checked', 'true');
    expect(qr).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(manual, { key: 'ArrowLeft' });
    expect(qr).toHaveFocus();
    expect(qr).toHaveAttribute('aria-checked', 'true');
  });

  it('retains private relay values when advanced settings are hidden and reopened', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Advanced: use a private relay' }));
    fireEvent.change(screen.getByLabelText('Relay URL'), {
      target: { value: 'https://private.example' },
    });
    fireEvent.change(screen.getByLabelText('Relay mint secret (private relays only)'), {
      target: { value: 'private-mint' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide advanced' }));
    expect(screen.getByRole('button', { name: 'Advanced: use a private relay' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Advanced: use a private relay' }));
    expect(screen.getByLabelText('Relay URL')).toHaveValue('https://private.example');
    expect(screen.getByLabelText('Relay mint secret (private relays only)')).toHaveValue(
      'private-mint',
    );
  });

  it('restores the setup choice when a pairing form is cancelled', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Set up sync' })).toHaveFocus();
  });

  it('keeps network failures visible with the retry action focused', async () => {
    setupFirstDeviceMock.mockRejectedValueOnce(new Error('Network unavailable.'));
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');
    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.change(screen.getByLabelText('Confirm recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set up sync' })).toHaveFocus());
  });

  it('starts default setup on the recovery phrase without exposing relay administration', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');
    await waitFor(() => expect(screen.getByLabelText('Recovery passphrase')).toHaveFocus());
    expect(screen.queryByLabelText('Relay URL')).not.toBeInTheDocument();
    expect(screen.queryByText(/mint secret is used/)).not.toBeInTheDocument();
  });

  it('keeps a mismatched confirmation associated with its field and ready to correct', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');
    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.change(screen.getByLabelText('Confirm recovery passphrase'), {
      target: { value: 'a different recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set up sync' }));
    const confirmation = screen.getByLabelText('Confirm recovery passphrase');
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    expect(confirmation).toHaveAccessibleDescription('The recovery passphrases do not match.');
    expect(setupFirstDeviceMock).not.toHaveBeenCalled();
  });

  it('persists join failure beside the passphrase and clears it after correction', async () => {
    joinWithPassphraseMock.mockRejectedValueOnce(new Error('Incorrect recovery passphrase.'));
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join another device' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Enter details' }));
    fireEvent.change(screen.getByLabelText('Channel id'), { target: { value: state.channelId } });
    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'an incorrect recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Recovery passphrase')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Recovery passphrase')).toHaveFocus();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect recovery passphrase.');
    expect(notify).not.toHaveBeenCalledWith('Incorrect recovery passphrase.', 'negative');
    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join channel' }));
    await screen.findByText('Paired to a sync channel');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).toHaveFocus());
  });

  it('offers setup and joining when no channel is configured', async () => {
    render(<SyncSection />);

    expect(await screen.findByRole('heading', { name: 'Another device' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));

    const dialog = await screen.findByRole('dialog', { name: 'Pair this device' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join another device' })).toBeInTheDocument();
  });

  it('treats share-link credentials alone as no sync channel', async () => {
    readSyncStateMock.mockResolvedValue({
      shareLinks: {
        ['f'.repeat(32)]: { relayUrl: 'https://relay.example', writeToken: 'a'.repeat(64) },
      },
    } satisfies SyncState);
    render(<SyncSection />);

    const pair = await screen.findByRole('button', { name: 'Pair' });
    expect(screen.queryByText('Paired to a sync channel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    fireEvent.click(pair);
    expect(await screen.findByRole('dialog', { name: 'Pair this device' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join another device' })).toBeInTheDocument();
  });

  it('sets up the first device after confirming a strong passphrase', async () => {
    render(<SyncSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set up sync' }));
    await screen.findByLabelText('Recovery passphrase');

    fireEvent.click(await screen.findByRole('button', { name: 'Advanced: use a private relay' }));
    fireEvent.change(screen.getByLabelText('Relay mint secret (private relays only)'), {
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
});
