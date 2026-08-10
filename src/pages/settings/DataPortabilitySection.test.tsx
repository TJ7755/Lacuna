import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupFile } from '../../db/types';
import { DataPortabilitySection } from './DataPortabilitySection';

const readBackupFile = vi.fn();

vi.mock('../../db/portability', () => ({
  importBackup: vi.fn(),
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
