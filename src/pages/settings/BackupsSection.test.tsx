import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupsSection } from './BackupsSection';

const mockDeleteBackup = vi.fn().mockResolvedValue(undefined);
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
  restoreBackup: vi.fn(),
  takeAutoBackup: vi.fn(),
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
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
    mockDeleteBackup.mockReset();
    mockDeleteBackup.mockResolvedValue(undefined);
    mockNotify.mockClear();
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toHaveFocus());
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

    expect(
      await screen.findByText(/local conversation is cleared only after the restore succeeds/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(
      screen.getByText('Replace all local data, disconnect AI and restore this point?'),
    ).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Automatic backups' })).toBeInTheDocument();
    expect(mockCheckPersistentStorage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Request persistence' })).not.toBeInTheDocument();
  });

  it('keeps the final restore-point list mounted for its outgoing transition', async () => {
    const view = render(
      <LazyMotion features={domAnimation}>
        <BackupsSection />
      </LazyMotion>,
    );
    expect(await screen.findByRole('button', { name: 'Delete' })).toBeInTheDocument();

    mockBackups = [];
    view.rerender(
      <LazyMotion features={domAnimation}>
        <BackupsSection />
      </LazyMotion>,
    );

    expect(screen.getByText('No restore points yet.')).toHaveStyle({ opacity: '0' });
    expect(screen.getByRole('list')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('list')).not.toBeInTheDocument());
  });

  it('brings a new restore point in through the list transition', async () => {
    const view = render(<BackupsSection />);
    await screen.findByRole('button', { name: 'Delete' });
    mockBackups = [
      ...mockBackups,
      {
        id: 8,
        createdAt: Date.UTC(2026, 7, 29),
        deckCount: 2,
        cardCount: 4,
      },
    ];

    view.rerender(<BackupsSection />);

    expect(screen.getAllByRole('listitem')[1]).toHaveStyle({ opacity: '0' });
  });
});
