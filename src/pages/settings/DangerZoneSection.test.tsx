import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DangerZoneSection } from './DangerZoneSection';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ notify }) }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));

beforeEach(() => notify.mockReset());
const props = () => ({
  entityLabel: 'course',
  entityName: 'Disposable course',
  description: 'Remove this course.',
  snapshot: vi.fn().mockResolvedValue({ id: 'snapshot' }),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onRestore: vi.fn(),
  onDeleted: vi.fn(),
});
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Delete course' }));

describe('DangerZoneSection', () => {
  it('returns focus to the delete trigger on Escape without deleting', () => {
    const callbacks = props();
    render(<DangerZoneSection {...callbacks} />);
    open();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Delete course' })).toHaveFocus();
    expect(callbacks.snapshot).not.toHaveBeenCalled();
  });

  for (const stage of ['snapshot', 'onDelete'] as const) {
    it(`reports ${stage} failure, stays in place and permits retry`, async () => {
      const callbacks = props();
      callbacks[stage].mockRejectedValueOnce(new Error('Storage unavailable'));
      render(<DangerZoneSection {...callbacks} />);
      open();
      await act(async () => open());
      expect(notify).toHaveBeenCalledWith('Storage unavailable', 'negative');
      expect(callbacks.onDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Delete course' })).toBeEnabled();
      if (stage === 'snapshot') expect(callbacks.onDelete).not.toHaveBeenCalled();
      await act(async () => open());
      expect(callbacks.onDeleted).toHaveBeenCalledOnce();
      expect(notify).toHaveBeenLastCalledWith(
        "'Disposable course' deleted.",
        'neutral',
        expect.objectContaining({ actionLabel: 'Undo' }),
      );
      const undo = notify.mock.calls.at(-1)?.[2].onAction;
      undo();
      expect(callbacks.onRestore).toHaveBeenCalledWith({ id: 'snapshot' });
    });
  }

  it('takes only one snapshot and deletes once while pending', async () => {
    const callbacks = props();
    let finish!: () => void;
    callbacks.snapshot.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<DangerZoneSection {...callbacks} />);
    open();
    open();
    open();
    expect(callbacks.snapshot).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Delete course' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => finish());
    expect(callbacks.onDelete).toHaveBeenCalledOnce();
    expect(callbacks.onDeleted).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("'Disposable course' deleted.", 'neutral', undefined);
  });
});
