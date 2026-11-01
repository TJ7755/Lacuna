import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/Toast';
import { BackupsSection } from './BackupsSection';

vi.mock('../../state/useData', () => ({ useBackups: () => [] }));
vi.mock('../../db/backupFolder', () => ({
  backupFolderName: async () => null,
  folderMirrorSupported: () => false,
}));

const storage = {
  persist: vi.fn(async () => true),
  persisted: vi.fn(async () => false),
  estimate: vi.fn(async () => ({})),
};

describe('backup storage guidance', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
    storage.persisted.mockResolvedValue(false);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'storage');
  });

  it('offers backup and sync inline when browser storage is not persistent', async () => {
    render(
      <ToastProvider>
        <BackupsSection />
      </ToastProvider>,
    );

    const note = await screen.findByRole('note', { name: 'Browser storage' });
    expect(within(note).getByRole('link', { name: 'Backups' })).toHaveAttribute(
      'href',
      '#/settings#settings-backups',
    );
    expect(within(note).getByRole('link', { name: 'Device sync' })).toHaveAttribute(
      'href',
      '#/settings#settings-sync',
    );
    expect(within(note).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Notifications')).queryByRole('link'),
    ).not.toBeInTheDocument();
  });

  it.each(['persisted', 'unsupported', 'partial API'])('hides the note when %s', async (state) => {
    if (state === 'persisted') storage.persisted.mockResolvedValue(true);
    else
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: state === 'unsupported' ? undefined : { persisted: storage.persisted },
      });
    render(
      <ToastProvider>
        <BackupsSection />
      </ToastProvider>,
    );

    await screen.findByText(
      state === 'persisted'
        ? 'Storage is persisted'
        : 'This browser does not support persistent storage.',
    );
    expect(screen.queryByRole('note', { name: 'Browser storage' })).not.toBeInTheDocument();
  });

  it('removes the note if a persistence request succeeds', async () => {
    render(
      <ToastProvider>
        <BackupsSection />
      </ToastProvider>,
    );
    await screen.findByRole('note', { name: 'Browser storage' });

    storage.persisted.mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Request persistence' }));

    await screen.findByText('Storage is persisted');
    expect(screen.queryByRole('note', { name: 'Browser storage' })).not.toBeInTheDocument();
  });
});
