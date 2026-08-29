import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSection } from './AiSection';

const state = vi.hoisted(() => ({
  settings: { enabled: false, misconceptionFirstEnabled: true },
  update: vi.fn(),
  resetConnection: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
}));

vi.mock('../../ai/settings', () => ({
  useAiSettings: () => [state.settings, state.update],
}));

vi.mock('../../ai/session/AiSessionContext', () => ({
  useOptionalAiSession: () => ({ resetConnection: state.resetConnection }),
}));

vi.mock('./AiMemoryInspector', () => ({
  AiMemoryInspector: () => <div>Teaching memory inspector</div>,
}));

describe('AiSection', () => {
  beforeEach(() => {
    state.settings.enabled = false;
    state.settings.misconceptionFirstEnabled = true;
    state.update.mockClear();
    state.resetConnection.mockClear();
  });

  it('makes the hidden-by-default opt-in and teaching method explicit', () => {
    render(<AiSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable AI' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Use misconception-first teaching' }));

    expect(state.update.mock.calls).toEqual([
      [{ enabled: true }],
      [{ misconceptionFirstEnabled: false }],
    ]);
  });

  it('revokes a connected relay before disabling AI', async () => {
    state.settings.enabled = true;
    render(<AiSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable AI' }));

    await vi.waitFor(() => expect(state.update).toHaveBeenCalledWith({ enabled: false }));
    expect(state.resetConnection).toHaveBeenCalledOnce();
    expect(state.resetConnection.mock.invocationCallOrder[0]).toBeLessThan(
      state.update.mock.invocationCallOrder[0],
    );
  });
});
