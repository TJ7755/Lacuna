import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSyncState } from '../../db/mutationStamp';
import type { SyncState } from '../../db/types';
import { SyncStatus } from './SyncStatus';

vi.mock('../../db/mutationStamp', () => ({ readSyncState: vi.fn() }));

const paired: SyncState = { channelId: 'channel', lastSuccessfulSyncAt: Date.now() };

async function renderStatus(state: SyncState | undefined) {
  vi.mocked(readSyncState).mockResolvedValue(state);
  await act(async () => {
    render(
      <MemoryRouter>
        <SyncStatus />
      </MemoryRouter>,
    );
  });
}

describe('Today sync status', () => {
  beforeEach(() => vi.mocked(readSyncState).mockReset());
  afterEach(() => vi.useRealTimers());

  it.each([undefined, {}, { shareLinks: {} }])('hides unpaired state %j', async (state) => {
    await renderStatus(state);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links healthy status to the existing sync destination using the existing labels', async () => {
    await renderStatus(paired);
    const link = screen.getByRole('link', { name: 'Synced just now · Open sync' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveTextContent('Synced just now');
  });

  it('keeps a first sync pending visibly labelled', async () => {
    await renderStatus({ channelId: 'channel' });
    expect(screen.getByRole('link', { name: 'Not yet synced · Open sync' })).toHaveTextContent(
      'Not yet synced',
    );
  });

  it.each([
    ['Network unavailable', paired, 'Synced just now'],
    ['Conflict', paired, 'Synced just now'],
    ['Passphrase required', { channelId: 'channel' }, 'Not yet synced'],
  ])('keeps a stored error visible: %s', async (lastError, state, label) => {
    await renderStatus({ ...state, lastError });
    const link = screen.getByRole('link', { name: `${label} · Sync failed · Open sync` });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).toHaveTextContent('Sync failed');
  });

  it('updates on polling, visibility and unpairing', async () => {
    vi.useFakeTimers();
    await renderStatus(paired);
    vi.mocked(readSyncState).mockResolvedValue({ ...paired, lastError: 'Network unavailable' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole('link')).toHaveTextContent('Sync failed');

    vi.mocked(readSyncState).mockResolvedValue(paired);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('link')).toHaveAccessibleName('Synced just now · Open sync');

    vi.mocked(readSyncState).mockResolvedValue(undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
