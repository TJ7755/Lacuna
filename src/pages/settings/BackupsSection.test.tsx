import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackupsSection } from './BackupsSection';

vi.mock('../../db/backups', () => ({
  backupFolderName: vi.fn().mockResolvedValue(null),
  chooseBackupFolder: vi.fn(),
  clearBackupFolder: vi.fn(),
  deleteBackup: vi.fn(),
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
  useToast: () => ({ notify: vi.fn() }),
}));

describe('BackupsSection', () => {
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
