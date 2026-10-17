import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { QuestionSetSaveStatus } from './QuestionSetSaveStatus';

it('keeps a failed save and its retry together beside the set actions', () => {
  const retry = vi.fn();
  render(
    <QuestionSetSaveStatus
      snapshot={{
        phase: 'error',
        dirty: true,
        draft: null,
        error: new Error('Storage unavailable'),
        requiresReload: false,
        conflictSource: null,
      }}
      onRetry={retry}
    />,
  );
  expect(screen.getByText('Could not save')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
  expect(retry).toHaveBeenCalledOnce();
});
