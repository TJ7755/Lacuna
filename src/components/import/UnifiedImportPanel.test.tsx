import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareCodeImportPanel } from './UnifiedImportPanel';

const mocks = vi.hoisted(() => ({
  decodeShare: vi.fn(),
  importSharePayload: vi.fn(),
  summariseShare: vi.fn(),
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));
vi.mock('../../db/share', () => ({
  decodeShare: mocks.decodeShare,
  importSharePayload: mocks.importSharePayload,
  summariseShare: mocks.summariseShare,
}));

describe('ShareCodeImportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decodeShare.mockResolvedValue({ v: 2 });
    mocks.summariseShare.mockReturnValue({
      kind: 'course',
      courseName: 'Imported biology',
      lessonCount: 1,
      cardCount: 2,
      exportedAt: 1_700_000_000_000,
      deckCount: 0,
      deckNames: [],
      omittedImages: false,
    });
    mocks.importSharePayload.mockResolvedValue({
      courses: 1,
      lessons: 1,
      cards: 2,
      courseIds: ['imported-course'],
    });
  });

  it('uses the existing preview and import pipeline in share-only mode', async () => {
    const onShareImport = vi.fn();
    render(<ShareCodeImportPanel onShareImport={onShareImport} />);

    expect(screen.queryByText('Import from text or file')).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText('Paste a Lacuna share code here (it starts with LAC)...'),
      { target: { value: 'LAC1payload' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read code' }));

    expect(await screen.findByText('Imported biology')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to my courses' }));

    await waitFor(() =>
      expect(onShareImport).toHaveBeenCalledWith(1, 2, ['imported-course']),
    );
    expect(mocks.decodeShare).toHaveBeenCalledWith('LAC1payload');
    expect(mocks.importSharePayload).toHaveBeenCalledWith({ v: 2 });
  });
});
