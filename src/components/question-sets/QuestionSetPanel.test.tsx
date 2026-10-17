import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { QuestionSetPanel } from './QuestionSetPanel';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

it('opens a focused task and returns focus to its trigger on Escape', () => {
  render(
    <QuestionSetPanel title="All parts">
      <button>Q1</button>
    </QuestionSetPanel>,
  );
  const trigger = screen.getByRole('button', { name: 'All parts' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'All parts' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
