import './SyncSection.testSupport';
import { readSyncStateMock, state } from './SyncSection.testSupport';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SyncState } from '@lacuna/core/db/types';
import { SyncSection } from './SyncSection';

describe('SyncSection status', () => {
  it('waits for the pairing state before offering setup', async () => {
    let finish!: (value: SyncState | undefined) => void;
    readSyncStateMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<SyncSection />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading sync status…');
    expect(screen.queryByRole('button', { name: 'Pair' })).not.toBeInTheDocument();

    await act(async () => finish(undefined));
    expect(screen.getByRole('button', { name: 'Pair' })).toBeInTheDocument();
  });

  it('keeps a failed read distinct from unpaired and retries the saved channel', async () => {
    readSyncStateMock.mockRejectedValueOnce(new Error('Storage unavailable'));
    readSyncStateMock.mockResolvedValueOnce(state);
    render(<SyncSection />);
    await screen.findByText('Sync status unavailable.');
    expect(screen.queryByRole('button', { name: 'Pair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry sync status' }));
    expect(await screen.findByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    expect(screen.getByText('Paired to a sync channel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pair' })).not.toBeInTheDocument();
    expect(readSyncStateMock).toHaveBeenCalledTimes(2);
  });
});
