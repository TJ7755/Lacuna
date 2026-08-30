import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupsSection } from './BackupsSection';

const mockDeleteBackup = vi.fn().mockResolvedValue(undefined);
const mockNotify = vi.fn();

vi.mock('../../db/backups', () => ({
  backupFolderName: vi.fn().mockResolvedValue(null),
  chooseBackupFolder: vi.fn(),
  clearBackupFolder: vi.fn(),
  deleteBackup: (id: number) => mockDeleteBackup(id),
  folderMirrorSupported: vi.fn().mockReturnValue(false),
  restoreBackup: vi.fn(),
  takeAutoBackup: vi.fn(),
}));

vi.mock('../../db/persistence', () => ({
  checkPersistentStorage: vi.fn().mockResolvedValue(null),
  requestPersistentStorage: vi.fn(),
}));

vi.mock('../../state/useData', () => ({
  useBackups: () => [
    {
      id: 7,
      createdAt: Date.UTC(2026, 7, 28),
      deckCount: 1,
      cardCount: 2,
    },
  ],
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify: mockNotify }),
}));

describe('BackupsSection', () => {
  beforeEach(() => {
    mockDeleteBackup.mockReset();
    mockDeleteBackup.mockResolvedValue(undefined);
    mockNotify.mockClear();
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
});
