import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiSection } from './AiSection';

const update = vi.fn();

vi.mock('../../ai/settings', () => ({
  useAiSettings: () => [
    { enabled: false, misconceptionFirstEnabled: true },
    update,
  ],
}));

describe('AiSection', () => {
  it('makes the hidden-by-default opt-in and teaching method explicit', () => {
    render(<AiSection />);

    fireEvent.click(screen.getByRole('switch', { name: 'Enable AI' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Use misconception-first teaching' }));

    expect(update.mock.calls).toEqual([
      [{ enabled: true }],
      [{ misconceptionFirstEnabled: false }],
    ]);
  });
});
