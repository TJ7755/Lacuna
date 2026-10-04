import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { QuestionSetPanel } from './QuestionSetPanel';

it('opens a focused task and returns focus to its trigger on Escape', () => {
  render(
    <QuestionSetPanel title="Practice evidence">
      <button>Continue marking</button>
    </QuestionSetPanel>,
  );
  const trigger = screen.getByRole('button', { name: 'Practice evidence' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Practice evidence' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
