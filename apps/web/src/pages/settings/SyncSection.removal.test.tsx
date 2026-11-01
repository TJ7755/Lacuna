import './SyncSection.testSupport';
import {
  clearUnlockedCredentialsMock,
  credentials,
  deleteChannelMock,
  forgetRememberedCredentialsMock,
  notify,
  publishUnlockedCredentialsMock,
  readRememberedCredentialsMock,
  readSyncStateMock,
  state,
  unpairMock,
} from './SyncSection.testSupport';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SyncSection } from './SyncSection';

describe('SyncSection removal', () => {
  it('deletes the shared channel with the credentials remembered by an unlocked device', async () => {
    readSyncStateMock.mockResolvedValue(state);
    readRememberedCredentialsMock.mockReturnValue(credentials);
    render(<SyncSection />);
    await screen.findByRole('button', { name: 'Lock' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));

    await waitFor(() => expect(deleteChannelMock).toHaveBeenCalledWith(state, credentials));
    expect(notify).not.toHaveBeenCalledWith('Enter a recovery passphrase.', 'negative');
    expect(await screen.findByRole('button', { name: 'Pair' })).toBeInTheDocument();
  });

  it('locking forgets the remembered copy and asks for the passphrase again', async () => {
    readSyncStateMock.mockResolvedValue(state);
    readRememberedCredentialsMock.mockReturnValue(credentials);
    render(<SyncSection />);
    await screen.findByRole('button', { name: 'Lock' });

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    expect(await screen.findByLabelText('Recovery passphrase')).toBeInTheDocument();
    expect(forgetRememberedCredentialsMock).toHaveBeenCalledTimes(1);
    expect(clearUnlockedCredentialsMock).toHaveBeenCalledTimes(1);
  });

  it('stays unlocked and reports the error when Lock cannot clear persisted credentials', async () => {
    readSyncStateMock.mockResolvedValue(state);
    readRememberedCredentialsMock.mockReturnValue(credentials);
    forgetRememberedCredentialsMock.mockRejectedValue(new Error('storage unavailable'));
    render(<SyncSection />);
    await screen.findByRole('button', { name: 'Lock' });

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('storage unavailable', 'negative'));
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
    expect(clearUnlockedCredentialsMock).toHaveBeenCalledTimes(1);
    expect(publishUnlockedCredentialsMock).toHaveBeenLastCalledWith(credentials);
  });

  it.each(['Remove', 'Delete channel'])(
    'returns focus to %s after cancelling or escaping without changing the channel',
    async (label) => {
      readSyncStateMock.mockResolvedValue({ ...state, lastError: 'Relay unavailable' });
      render(<SyncSection />);
      await screen.findByText('Paired to a sync channel');

      for (const escape of [false, true]) {
        const trigger = screen.getByRole('button', { name: label });
        trigger.focus();
        fireEvent.click(trigger);
        const cancel = screen.getByRole('button', { name: 'Cancel' });
        expect(cancel).toHaveFocus();
        expect(screen.getByRole('status')).toHaveTextContent(
          label === 'Remove'
            ? 'Remove sync from this device?'
            : 'Delete the shared channel everywhere?',
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Relay unavailable');
        expect(
          screen.queryByRole('button', {
            name: label === 'Remove' ? 'Delete channel' : 'Remove',
          }),
        ).not.toBeInTheDocument();
        if (escape) fireEvent.keyDown(cancel, { key: 'Escape' });
        else fireEvent.click(cancel);
        expect(screen.getByRole('button', { name: label })).toHaveFocus();
      }
      expect(unpairMock).not.toHaveBeenCalled();
      expect(deleteChannelMock).not.toHaveBeenCalled();
      expect(forgetRememberedCredentialsMock).not.toHaveBeenCalled();
    },
  );

  it('keeps unpairing local and does not purge the shared channel', async () => {
    readSyncStateMock.mockResolvedValue(state);
    render(<SyncSection />);
    await screen.findByText('Paired to a sync channel');

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unpair' }));

    await waitFor(() => expect(unpairMock).toHaveBeenCalledTimes(1));
    expect(deleteChannelMock).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Pair' })).toBeInTheDocument();
  });

  it('requires the recovery passphrase before deleting the shared channel', async () => {
    readSyncStateMock.mockResolvedValue(state);
    render(<SyncSection />);
    await screen.findByText('Paired to a sync channel');

    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));
    expect(deleteChannelMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete channel' })).toBeEnabled(),
    );

    fireEvent.change(screen.getByLabelText('Recovery passphrase'), {
      target: { value: 'a long recovery phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete channel' }));

    await waitFor(() =>
      expect(deleteChannelMock).toHaveBeenCalledWith(state, 'a long recovery phrase'),
    );
    expect(await screen.findByRole('button', { name: 'Pair' })).toBeInTheDocument();
  });
});
