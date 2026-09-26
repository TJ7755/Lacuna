import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { QuestionSetImage } from './QuestionSetImage';
import type { QuestionSetDraftSession } from '../../questions/questionSetDraftSession';

it('uses a named image chooser and only asks for a description after selection', async () => {
  const insertImage = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <QuestionSetImage
      session={{ insertImage } as unknown as QuestionSetDraftSession}
      nodeId="q1"
    />,
  );
  fireEvent.click(screen.getByText('Add a diagram or image'));
  expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Image description')).not.toBeInTheDocument();
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).not.toBeVisible();
  const file = new File(['image'], 'cell.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText('cell.png')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Image description'), {
    target: { value: 'Water enters a cell.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add image' }));
  await waitFor(() => expect(insertImage).toHaveBeenCalledWith('q1', file, 'Water enters a cell.'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeInTheDocument(),
  );
  expect(input.value).toBe('');
});
