import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '../../db/types';
import { DataPortabilitySection } from './DataPortabilitySection';

const { readBackupFile, importBackup, manualMerge, notify } = vi.hoisted(() => ({
  readBackupFile: vi.fn(),
  importBackup: vi.fn(),
  manualMerge: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../../db/portability', () => ({
  importBackup,
  readBackupFile: (...args: unknown[]) => readBackupFile(...args),
}));

vi.mock('../../sync/manualMerge', () => ({
  manualMerge: (...args: unknown[]) => manualMerge(...args),
}));

vi.mock('../../components/import/UnifiedExportPanel', () => ({
  UnifiedExportPanel: () => null,
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

function backupStub(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    app: 'lacuna',
    version: 10,
    exportedAt: Date.now(),
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  } as BackupFile;
}

async function chooseMergeFile() {
  const input = screen.getByLabelText('Merge from another device');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['{}'], 'backup.json')] } });
  });
}

describe('DataPortabilitySection', () => {
  beforeEach(() => {
    readBackupFile.mockReset();
    importBackup.mockReset();
    manualMerge.mockReset();
    notify.mockReset();
  });

  it('requires explicit confirmation before replacing local data', async () => {
    readBackupFile.mockResolvedValue({
      decks: [],
      lessons: [],
      cards: [],
      exportedAt: Date.now(),
    } as unknown as BackupFile);
    const { container } = render(<DataPortabilitySection motionMultiplier={0} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['{}'], 'backup.json')] } });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Replace local data' }));
    expect(importBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace local data' }));
    await waitFor(() => expect(importBackup).toHaveBeenCalledWith(expect.anything(), 'replace'));
  });

  it('reports the backup lesson count rather than the internal deck count', async () => {
    readBackupFile.mockResolvedValue({
      decks: Array.from({ length: 5 }),
      lessons: Array.from({ length: 7 }),
      cards: Array.from({ length: 36 }),
      exportedAt: new Date(2026, 7, 10).getTime(),
    } as unknown as BackupFile);

    const { container } = render(<DataPortabilitySection motionMultiplier={0} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [new File(['{}'], 'backup.json')] } });

    expect(await screen.findByText(/This backup contains/)).toHaveTextContent(
      'This backup contains 7 lessons and 36 cards',
    );
  });

  it('reports folder names discarded while importing a legacy backup', async () => {
    readBackupFile.mockResolvedValue({
      decks: [{}],
      cards: [],
      exportedAt: Date.now(),
    } as unknown as BackupFile);
    importBackup.mockResolvedValue({ discardedFolderNames: ['Chemistry', 'Organic'] });
    const { container } = render(<DataPortabilitySection motionMultiplier={0} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['{}'], 'backup.json')] } });

    fireEvent.click(await screen.findByRole('button', { name: 'Merge backup' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Backup merged. Folder hierarchy was discarded: Chemistry, Organic.',
        'positive',
      ),
    );
  });

  it('requires confirmation before merging from another device', async () => {
    readBackupFile.mockResolvedValue(backupStub({
      lessons: Array.from({ length: 2 }),
      cards: Array.from({ length: 4 }),
    }));
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseMergeFile();

    expect(await screen.findByText(/Data from both devices is combined/)).toBeInTheDocument();
    expect(screen.getByText(/The newest edit of each item wins/)).toBeInTheDocument();
    expect(screen.getByText(/Deletions from either device are honoured/)).toBeInTheDocument();
    expect(screen.getByText(/A backup of this device is taken first/)).toBeInTheDocument();
    expect(manualMerge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(manualMerge).toHaveBeenCalledTimes(1));
  });

  it('shows the merge summary on success', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockResolvedValue({
      before: { cards: 12, courses: 1, lessons: 3, reviewEvents: 40 },
      after: { cards: 15, courses: 2, lessons: 5, reviewEvents: 52 },
    });
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseMergeFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Merged. Cards 12 → 15. Courses 1 → 2. Lessons 3 → 5. Review events 40 → 52.',
        'positive',
      ),
    );
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('rejects an invalid merge file without writing', async () => {
    readBackupFile.mockRejectedValue(new Error('This file is not a valid Lacuna backup.'));
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseMergeFile();

    expect(notify).toHaveBeenCalledWith('This file is not a valid Lacuna backup.', 'negative');
    expect(manualMerge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
  });

  it('surfaces a pre-import merge failure and leaves the existing import path unused', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockRejectedValue(
      Object.assign(new Error('IndexedDB unavailable. A safety backup could not be taken, so the database was not modified.'), {
        databaseModified: false,
      }),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseMergeFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'IndexedDB unavailable. A safety backup could not be taken, so the database was not modified.',
        'negative',
      ),
    );
    expect(importBackup).not.toHaveBeenCalled();
  });

  it('disables the merge action while the merge is running', async () => {
    let resolveMerge: (value: unknown) => void = () => undefined;
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockImplementation(
      () => new Promise((resolve) => {
        resolveMerge = resolve;
      }),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseMergeFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

    expect(await screen.findByRole('button', { name: 'Merging…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      resolveMerge({
        before: { cards: 0, courses: 0, lessons: 0, reviewEvents: 0 },
        after: { cards: 0, courses: 0, lessons: 0, reviewEvents: 0 },
      });
    });
  });
});
