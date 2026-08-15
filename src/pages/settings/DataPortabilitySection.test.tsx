import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '../../db/types';
import { ManualMergeError } from '../../sync/manualMerge';
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

vi.mock('../../sync/manualMerge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sync/manualMerge')>();
  return {
    ...actual,
    manualMerge: (...args: unknown[]) => manualMerge(...args),
  };
});

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
    exportedAt: new Date(2026, 7, 12).getTime(),
    cards: [],
    assets: [],
    sessionHistory: [],
    userPerformance: [],
    ...overrides,
  } as BackupFile;
}

async function chooseRecoverFile() {
  const input = screen.getByLabelText('Recover this installation');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['{}'], 'backup.json')] } });
  });
}

async function chooseCombineFile() {
  const input = screen.getByLabelText('Backup from another device');
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
    readBackupFile.mockResolvedValue(backupStub());
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    fireEvent.click(await screen.findByRole('button', { name: 'Replace local data' }));
    expect(importBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace local data' }));
    await waitFor(() => expect(importBackup).toHaveBeenCalledWith(expect.anything(), 'replace'));
  });

  it('describes add-from-backup without a recency rule', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    expect(await screen.findByText(/keeps your current data and folds in the backup/)).toHaveTextContent(
      'Add from backup keeps your current data and folds in the backup; existing items are not deleted.',
    );
    expect(screen.queryByText(/more recently updated/)).not.toBeInTheDocument();
  });

  it('reports the backup lesson count rather than the internal deck count', async () => {
    readBackupFile.mockResolvedValue(backupStub({
      decks: Array.from({ length: 5 }),
      lessons: Array.from({ length: 7 }),
      cards: Array.from({ length: 36 }),
      exportedAt: new Date(2026, 7, 10).getTime(),
    }) as BackupFile);

    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    expect(await screen.findByText(/This backup contains/)).toHaveTextContent(
      'This backup contains 7 lessons and 36 cards',
    );
  });

  it('requires confirmation before combining with another device', async () => {
    readBackupFile.mockResolvedValue(backupStub({
      lessons: Array.from({ length: 2 }),
      cards: Array.from({ length: 4 }),
    }));
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();

    expect(await screen.findByText(/Combine with the 12 August 2026 backup \(4 cards\)\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Data from both devices is combined/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    expect(manualMerge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Combine' }));
    await waitFor(() => expect(manualMerge).toHaveBeenCalledTimes(1));
  });

  it('explains combining in the resting copy, not at the confirm', () => {
    render(<DataPortabilitySection motionMultiplier={0} />);

    expect(screen.getByRole('heading', { name: 'Another device' })).toBeInTheDocument();
    expect(screen.getByText(/Cards and reviews from either side are kept/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose backup from another device' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recover this installation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add from backup' })).not.toBeInTheDocument();
  });

  it('shows the combine summary on success', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockResolvedValue({
      cards: { kept: 12, added: 3, removed: 0 },
      courses: { kept: 1, added: 1, removed: 0 },
      lessons: { kept: 3, added: 2, removed: 0 },
      reviewEvents: { kept: 40, added: 12, removed: 0 },
    });
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Combined. 12 cards kept, 3 added. 12 reviews added. A restore point was saved.',
        'positive',
      ),
    );
    expect(importBackup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose backup from another device' })).toBeInTheDocument();
  });

  it('names removed cards in the success notice', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockResolvedValue({
      cards: { kept: 12, added: 0, removed: 1 },
      courses: { kept: 1, added: 0, removed: 0 },
      lessons: { kept: 3, added: 0, removed: 0 },
      reviewEvents: { kept: 40, added: 0, removed: 2 },
    });
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Combined. 12 cards kept, 1 removed. 2 reviews removed. A restore point was saved.',
        'positive',
      ),
    );
  });

  it('rejects an invalid combine file without writing', async () => {
    readBackupFile.mockRejectedValue(new Error('This file is not a valid Lacuna backup.'));
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();

    expect(notify).toHaveBeenCalledWith('This file is not a valid Lacuna backup.', 'negative');
    expect(manualMerge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Combine' })).not.toBeInTheDocument();
  });

  it('surfaces a pre-import combine failure and leaves the file offered', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockRejectedValue(
      new ManualMergeError(
        'IndexedDB unavailable. A safety backup could not be taken, so the database was not modified.',
        { databaseModified: false },
      ),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'IndexedDB unavailable. A safety backup could not be taken, so the database was not modified.',
        'negative',
      ),
    );
    expect(importBackup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Combine' })).toBeInTheDocument();
  });

  it('points at restore points when combine writes then fails', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockRejectedValue(
      new ManualMergeError('The import did not finish.', { databaseModified: true }),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'The import did not finish. Restore from Automatic backups if this installation looks wrong.',
        'negative',
      ),
    );
  });

  it('disables the combine action while it is running', async () => {
    let resolveMerge: (value: unknown) => void = () => undefined;
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockImplementation(
      () => new Promise((resolve) => {
        resolveMerge = resolve;
      }),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    expect(await screen.findByRole('button', { name: 'Combining…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await act(async () => {
      resolveMerge({
        cards: { kept: 0, added: 0, removed: 0 },
        courses: { kept: 0, added: 0, removed: 0 },
        lessons: { kept: 0, added: 0, removed: 0 },
        reviewEvents: { kept: 0, added: 0, removed: 0 },
      });
    });
  });
});
