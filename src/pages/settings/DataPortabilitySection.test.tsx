import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '../../db/types';
import { DataPortabilitySection } from './DataPortabilitySection';

const { readBackupFile, importBackup } = vi.hoisted(() => ({
  readBackupFile: vi.fn(),
  importBackup: vi.fn(),
}));

vi.mock('../../db/portability', () => ({
  importBackup,
  readBackupFile: (...args: unknown[]) => readBackupFile(...args),
}));

vi.mock('../../components/import/UnifiedExportPanel', () => ({
  UnifiedExportPanel: () => null,
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify: vi.fn() }),
}));

describe('DataPortabilitySection', () => {
  beforeEach(() => {
    readBackupFile.mockReset();
    importBackup.mockReset();
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
    } as BackupFile);

    const { container } = render(<DataPortabilitySection motionMultiplier={0} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    fireEvent.change(input!, { target: { files: [new File(['{}'], 'backup.json')] } });

    expect(await screen.findByText(/This backup contains/)).toHaveTextContent(
      'This backup contains 7 lessons and 36 cards',
    );
  });
});
