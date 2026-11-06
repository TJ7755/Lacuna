import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '@lacuna/core/db/types';
import { ManualMergeError } from '../../sync/manualMerge';
import type * as ManualMergeModule from '../../sync/manualMerge';
import { DataPortabilitySection } from './DataPortabilitySection';

const { readBackupFile, importBackup, manualMerge, notify, replace } = vi.hoisted(() => ({
  readBackupFile: vi.fn(),
  importBackup: vi.fn(),
  manualMerge: vi.fn(),
  notify: vi.fn(),
  replace: vi.fn((_kind: string, operation: () => Promise<unknown>) => operation()),
}));

vi.mock('../../db/replacementLifecycle', () => ({
  replacementLifecycle: { replace },
}));

vi.mock('../../db/portability', () => ({
  importBackup,
  readBackupFile: (...args: unknown[]) => readBackupFile(...args),
}));

vi.mock('../../sync/manualMerge', async (importOriginal) => {
  const actual = await importOriginal<typeof ManualMergeModule>();
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
    version: 11,
    exportedAt: new Date(2026, 7, 12).getTime(),
    cards: [],
    concepts: [],
    questions: [],
    questionConcepts: [],
    questionAttempts: [],
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
    replace.mockClear();
  });

  it('requires explicit confirmation before replacing local data', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    fireEvent.click(await screen.findByRole('button', { name: 'Replace local data' }));
    expect(
      screen.getByText('Delete current local data, disconnect AI and restore this backup?'),
    ).toBeInTheDocument();
    expect(importBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace local data' }));
    await waitFor(() => expect(importBackup).toHaveBeenCalledWith(expect.anything(), 'replace'));
    expect(replace).toHaveBeenCalledWith('manual', expect.any(Function));
  });

  it('applies additive recovery exclusively without requesting manual AI shutdown', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    fireEvent.click(screen.getByRole('button', { name: 'Add from backup' }));

    await waitFor(() => expect(importBackup).toHaveBeenCalledWith(expect.anything(), 'merge'));
    expect(replace).toHaveBeenCalledWith('recovery', expect.any(Function));
  });

  it('reports the backup lesson count rather than the internal deck count', async () => {
    readBackupFile.mockResolvedValue(
      backupStub({
        decks: Array.from({ length: 5 }),
        lessons: Array.from({ length: 7 }),
        cards: Array.from({ length: 36 }),
        questions: Array.from({ length: 4 }),
        exportedAt: new Date(2026, 7, 10).getTime(),
      }) as BackupFile,
    );

    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();

    expect(await screen.findByText('7 lessons')).toBeInTheDocument();
    expect(screen.getByText('36 cards')).toBeInTheDocument();
    expect(screen.getByText('4 Questions')).toBeInTheDocument();
    expect(screen.getByText('10 August 2026')).toBeInTheDocument();
  });

  it('requires confirmation before combining with another device', async () => {
    readBackupFile.mockResolvedValue(
      backupStub({
        lessons: Array.from({ length: 2 }),
        cards: Array.from({ length: 4 }),
      }),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();

    expect(
      await screen.findByText(/Combine with the 12 August 2026 backup \(4 cards, 0 Questions\)\?/),
    ).toHaveTextContent('Deletions from either device apply.');
    expect(screen.queryByText(/Data from both devices is combined/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument();
    expect(manualMerge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Combine' }));
    await waitFor(() => expect(manualMerge).toHaveBeenCalledTimes(1));
  });

  it('keeps the existing recovery choices in the resting view', () => {
    render(<DataPortabilitySection motionMultiplier={0} />);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Combine two devices' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose backup from another device' }),
    ).toBeInTheDocument();
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
      concepts: { kept: 4, added: 1, removed: 0 },
      questions: { kept: 2, added: 1, removed: 0 },
      questionConcepts: { kept: 2, added: 1, removed: 0 },
      questionAttempts: { kept: 3, added: 2, removed: 0 },
    });
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseCombineFile();
    fireEvent.click(await screen.findByRole('button', { name: 'Combine' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        'Combined. 12 cards kept, 3 added. 1 course kept, 1 added. 3 lessons kept, 2 added. 4 Concepts kept, 1 added. 2 Questions kept, 1 added. 2 Question relationships kept, 1 added. 3 Question attempts kept, 2 added. 12 reviews added. A restore point was saved.',
        'positive',
      ),
    );
    expect(importBackup).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Choose backup from another device' }),
    ).toBeInTheDocument();
  });

  it('names removed cards in the success notice', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockResolvedValue({
      cards: { kept: 12, added: 0, removed: 1 },
      courses: { kept: 1, added: 0, removed: 0 },
      lessons: { kept: 3, added: 0, removed: 0 },
      reviewEvents: { kept: 40, added: 0, removed: 2 },
      concepts: { kept: 0, added: 0, removed: 0 },
      questions: { kept: 0, added: 0, removed: 0 },
      questionConcepts: { kept: 0, added: 0, removed: 0 },
      questionAttempts: { kept: 0, added: 0, removed: 0 },
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

    expect(screen.getByRole('alert')).toHaveTextContent('This file is not a valid Lacuna backup.');
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'IndexedDB unavailable. A safety backup could not be taken, so the database was not modified.',
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

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The import did not finish. Use a restore point if this installation looks wrong.',
    );
  });

  it.each(['merge', 'replace'] as const)(
    'keeps the selected backup and specific error for a %s retry',
    async (mode) => {
      const backup = backupStub();
      readBackupFile.mockResolvedValue(backup);
      importBackup.mockRejectedValueOnce(new Error('Storage is full. Free space and try again.'));
      render(<DataPortabilitySection motionMultiplier={0} />);
      await chooseRecoverFile();
      const label = mode === 'replace' ? 'Replace local data' : 'Add from backup';
      if (mode === 'replace') fireEvent.click(screen.getByRole('button', { name: label }));
      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Storage is full. Free space and try again.',
      );
      expect(screen.getByRole('heading', { name: 'backup.json' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: label })).toBeEnabled();
      expect(notify).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: label }));

      await waitFor(() => expect(importBackup).toHaveBeenCalledTimes(2));
      expect(importBackup).toHaveBeenLastCalledWith(backup, mode);
      expect(readBackupFile).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'backup.json' })).not.toBeInTheDocument(),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('blocks replacement, new files, cancellation and duplicate activation while adding', async () => {
    let complete: () => void = () => {};
    importBackup.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    readBackupFile.mockResolvedValue(backupStub());
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();
    fireEvent.click(screen.getByRole('button', { name: 'Add from backup' }));

    expect(await screen.findByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace local data' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose backup file' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Choose backup from another device' }),
    ).toBeDisabled();
    await chooseCombineFile();
    fireEvent.click(screen.getByRole('button', { name: 'Adding…' }));
    expect(importBackup).toHaveBeenCalledOnce();
    expect(readBackupFile).toHaveBeenCalledOnce();
    await act(async () => complete());
  });

  it('retains a global error notice if the learner navigates away during recovery', async () => {
    let rejectImport: (error: Error) => void = () => {};
    importBackup.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectImport = reject;
        }),
    );
    readBackupFile.mockResolvedValue(backupStub());
    const view = render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();
    fireEvent.click(screen.getByRole('button', { name: 'Add from backup' }));
    await waitFor(() => expect(importBackup).toHaveBeenCalledOnce());
    view.unmount();

    await act(async () => rejectImport(new Error('Storage is full. Free space and try again.')));

    expect(notify).toHaveBeenCalledWith('Storage is full. Free space and try again.', 'negative');
  });

  it('uses the shared, concise quota explanation rather than the repeated database exception', async () => {
    readBackupFile.mockResolvedValue(backupStub());
    importBackup.mockRejectedValue(
      new DOMException('Repeated low-level detail', 'QuotaExceededError'),
    );
    render(<DataPortabilitySection motionMultiplier={0} />);
    await chooseRecoverFile();
    fireEvent.click(screen.getByRole('button', { name: 'Add from backup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your browser storage is full. Export a backup before removing unused content.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Repeated low-level detail');
  });

  it('disables the combine action while it is running', async () => {
    let resolveMerge: (value: unknown) => void = () => undefined;
    readBackupFile.mockResolvedValue(backupStub());
    manualMerge.mockImplementation(
      () =>
        new Promise((resolve) => {
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
        concepts: { kept: 0, added: 0, removed: 0 },
        questions: { kept: 0, added: 0, removed: 0 },
        questionConcepts: { kept: 0, added: 0, removed: 0 },
        questionAttempts: { kept: 0, added: 0, removed: 0 },
      });
    });
  });
});
