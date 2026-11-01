import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupFolderName } from '../../db/backupFolder';
import { BackupsSection } from './BackupsSection';

const mockDeleteBackup = vi.fn().mockResolvedValue(undefined);
const mockRestoreBackup = vi.fn().mockResolvedValue(undefined);
const mockTakeAutoBackup = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();
const mockCheckPersistentStorage = vi.fn().mockResolvedValue(null);
const mockRequestPersistentStorage = vi.fn();
let mockBackups = [
  {
    id: 7,
    createdAt: Date.UTC(2026, 7, 28),
    deckCount: 1,
    cardCount: 2,
  },
];

vi.mock('../../db/backups', () => ({
  deleteBackup: (id: number) => mockDeleteBackup(id),
  restoreBackup: (id: number) => mockRestoreBackup(id),
  takeAutoBackup: (force?: boolean) => mockTakeAutoBackup(force),
}));

vi.mock('../../db/backupFolder', () => ({
  backupFolderName: vi.fn().mockResolvedValue(null),
  chooseBackupFolder: vi.fn(),
  clearBackupFolder: vi.fn(),
  folderMirrorSupported: vi.fn().mockReturnValue(false),
}));

vi.mock('../../db/persistence', () => ({
  checkPersistentStorage: (...args: unknown[]) => mockCheckPersistentStorage(...args),
  requestPersistentStorage: (...args: unknown[]) => mockRequestPersistentStorage(...args),
}));

vi.mock('../../state/useData', () => ({
  useBackups: () => mockBackups,
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

describe('BackupsSection', () => {
  beforeEach(() => {
    const nativeAnimate = Element.prototype.animate;
    vi.spyOn(Element.prototype, 'animate').mockImplementation(function (this: Element, ...args) {
      const animation = nativeAnimate.apply(this, args);
      // Happy DOM rejects cancelled animation promises when Motion tears down a card.
      void animation.finished.catch(() => {});
      return animation;
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
    mockDeleteBackup.mockReset();
    mockDeleteBackup.mockResolvedValue(undefined);
    mockNotify.mockClear();
    mockRestoreBackup.mockClear();
    mockTakeAutoBackup.mockClear();
    mockCheckPersistentStorage.mockReset();
    mockCheckPersistentStorage.mockResolvedValue(null);
    mockRequestPersistentStorage.mockReset();
    mockBackups = [
      {
        id: 7,
        createdAt: Date.UTC(2026, 7, 28),
        deckCount: 1,
        cardCount: 2,
      },
    ];
    window.location.hash = '#/';
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows three recent points and keeps older actions behind More', async () => {
    mockBackups = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      createdAt: Date.UTC(2026, 7, 28) - index * 60_000,
      deckCount: 1,
      cardCount: 2,
    }));
    render(<BackupsSection />);

    expect(await screen.findAllByRole('button', { name: 'Restore' })).toHaveLength(3);
    const more = screen.getByRole('button', { name: 'More restore points' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(8);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[7]);
    const dialog = await screen.findByRole('alertdialog', { name: /^Go back to/ });
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreBackup).toHaveBeenCalledWith(8));
    fireEvent.click(more);
    expect(screen.getAllByRole('button', { name: 'Restore' })).toHaveLength(3);
  });

  it('returns focus after an older point moves into the recent list', async () => {
    mockBackups = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      createdAt: Date.UTC(2026, 7, 28) - index * 60_000,
      deckCount: 1,
      cardCount: 2,
    }));
    const view = render(
      <LazyMotion features={domAnimation}>
        <BackupsSection />
      </LazyMotion>,
    );
    mockBackups = mockBackups.slice(1);
    view.rerender(
      <LazyMotion features={domAnimation}>
        <BackupsSection />
      </LazyMotion>,
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(3));
    const trigger = screen.getAllByRole('button', { name: 'Delete' })[2];
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Delete' })[2]).toHaveFocus());
  });

  it('requires explicit confirmation before deleting a restore point from Lacuna', async () => {
    render(<BackupsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mockDeleteBackup).not.toHaveBeenCalled();
    expect(
      screen.getByText('Delete this restore point from Lacuna? Mirrored files are not removed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Delete this restore point from Lacuna? Mirrored files are not removed.',
    );
    expect(screen.getByRole('button', { name: 'Delete restore point' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Delete restore point' }));
    await waitFor(() => expect(mockDeleteBackup).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up' })).toHaveFocus());
  });

  it('keeps confirmation open and reports a failed restore-point deletion', async () => {
    mockDeleteBackup.mockRejectedValueOnce(new Error('IndexedDB refused the delete.'));
    render(<BackupsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete restore point' }));

    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('IndexedDB refused the delete.', 'negative'),
    );
    expect(
      screen.getByText('Delete this restore point from Lacuna? Mirrored files are not removed.'),
    ).toBeInTheDocument();
  });

  it('returns focus to the matching delete trigger when confirmation is cancelled', async () => {
    render(<BackupsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'Delete restore point' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus());
  });

  it('offers a full backup when persistent storage is denied', async () => {
    mockCheckPersistentStorage.mockResolvedValue({
      supported: true,
      persisted: false,
      granted: false,
    });
    mockRequestPersistentStorage.mockResolvedValue({
      supported: true,
      persisted: false,
      granted: false,
    });

    render(<BackupsSection />);

    await screen.findByText('Storage is not persisted');
    fireEvent.click(screen.getByRole('button', { name: 'Request persistence' }));

    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('Persistent storage was denied.', 'negative', {
        actionLabel: 'Export backup',
        onAction: expect.any(Function),
      }),
    );
    const options = mockNotify.mock.calls.at(-1)?.[2] as { onAction: () => void };
    options.onAction();
    expect(window.location.hash).toBe('#/settings#settings-export');
  });

  it('states the AI consequence before confirming a full restore', async () => {
    render(<BackupsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));

    const dialog = await screen.findByRole('alertdialog', { name: /^Go back to/ });
    expect(dialog).toHaveTextContent(
      'Replace all local data, disconnect AI and restore this point?',
    );
    expect(dialog).toHaveTextContent(
      'local conversation is cleared only after the restore succeeds',
    );
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockRestoreBackup).toHaveBeenCalledWith(7));
  });

  it('does not request or show browser persistence controls in Electron', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { isElectron: true },
    });
    mockCheckPersistentStorage.mockResolvedValue({
      supported: true,
      persisted: false,
      usage: null,
      quota: null,
    });

    render(<BackupsSection />);

    expect(
      await screen.findByRole('heading', { name: 'Everything lives on this device' }),
    ).toBeInTheDocument();
    expect(mockCheckPersistentStorage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Request persistence' })).not.toBeInTheDocument();
  });

  it('forces a restore point when Back up is pressed and confirms with a tick', async () => {
    render(<BackupsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Back up' }));

    await waitFor(() => expect(mockTakeAutoBackup).toHaveBeenCalledWith(true));
    expect(await screen.findByRole('button', { name: 'Backed up' })).toBeInTheDocument();
    expect(screen.getByText('Backed up just now')).toBeInTheDocument();
  });

  it('shows a stale backup in warning colour and a recent one as backed up', async () => {
    mockBackups = [
      { id: 7, createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000, deckCount: 1, cardCount: 2 },
    ];
    const view = render(<BackupsSection />);
    expect(await screen.findByText(/^Last backup /)).toHaveClass('text-warning-fg');

    mockBackups = [{ id: 8, createdAt: Date.now() - 60 * 60 * 1000, deckCount: 1, cardCount: 2 }];
    view.rerender(<BackupsSection />);
    expect(await screen.findByText(/^Backed up /)).toHaveClass('text-positive');
  });

  it('shows a negative notice when the backup folder cannot be read', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    vi.mocked(backupFolderName).mockRejectedValueOnce(new Error('denied'));
    render(<BackupsSection />);
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith(
        'Could not read the backup folder setting.',
        'negative',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUnhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', onUnhandled);
  });

  it('tolerates a failed persistence check without an unhandled rejection', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    mockCheckPersistentStorage.mockRejectedValueOnce(new Error('denied'));
    render(<BackupsSection />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onUnhandled).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    process.off('unhandledRejection', onUnhandled);
  });
});
