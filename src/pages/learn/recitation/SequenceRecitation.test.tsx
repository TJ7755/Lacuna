import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Sequence } from '../../../db/types';
import { SequenceRecitation } from './SequenceRecitation';

const sequence: Sequence = {
  id: 'sequence-1',
  courseId: 'course-1',
  primaryLessonId: null,
  name: 'Verse',
  mode: 'lines',
  presetId: 'poetry',
  items: [
    { id: 'line-0', value: 'Alpha line' },
    { id: 'line-1', value: 'Beta line' },
    { id: 'line-2', value: 'Gamma line' },
  ],
  cueWindow: 2,
  recitationChunkSize: 2,
  createdAt: 0,
  updatedAt: 0,
};

function renderRecitation(onCheck = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <SequenceRecitation sequence={sequence} masteredItemIds={new Set()} onCheck={onCheck} />,
  );
  return { ...view, onCheck };
}

beforeEach(() => {
  localStorage.clear();
});

it('presents only the new line, then hides it once the learner recites', async () => {
  renderRecitation();
  expect(await screen.findByText('Alpha line')).toBeInTheDocument();
  expect(screen.queryByText('Beta line')).not.toBeInTheDocument();
  expect(screen.queryByText('Gamma line')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Recite' }));

  expect(screen.getByRole('textbox', { name: 'line 1' })).toBeInTheDocument();
  expect(screen.queryByText('Alpha line')).not.toBeInTheDocument();
});

it('waits for manual marking even when every typed line matches', async () => {
  const { onCheck } = renderRecitation();
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
    target: { value: 'alpha line' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  expect(onCheck).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'All correct' }));

  await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  expect(onCheck).toHaveBeenCalledWith(
    expect.objectContaining({
      results: [{ itemId: 'line-0', correct: true }],
      masteredItemIds: [],
    }),
  );
  expect(await screen.findByText('Beta line')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recite' })).toBeInTheDocument();
});

it('lets the learner mark a mistyped line without an automatic verdict', async () => {
  const { onCheck } = renderRecitation();
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
    target: { value: 'Alpha lime' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  const toggle = await screen.findByRole('button', { name: 'line 1: correct' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(onCheck).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'All correct' })).toBeInTheDocument();
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  expect(onCheck).toHaveBeenCalledWith(
    expect.objectContaining({
      results: [{ itemId: 'line-0', correct: false }],
      masteredItemIds: [],
    }),
  );
  expect(await screen.findByRole('textbox', { name: 'line 1' })).toBeInTheDocument();
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  expect(screen.queryByText('Beta line')).not.toBeInTheDocument();
});

it('reports both lines of a completed chunk as mastered', async () => {
  const { onCheck } = renderRecitation();

  // Chunk 1, line 1.
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
    target: { value: 'Alpha line' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(screen.getByRole('button', { name: 'All correct' }));
  await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Beta line')).toBeInTheDocument();

  // Chunk 1, both lines recited from memory.
  fireEvent.click(screen.getByRole('button', { name: 'Recite' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
    target: { value: 'Alpha line' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'line 2' }), {
    target: { value: 'Beta line' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));

  fireEvent.click(screen.getByRole('button', { name: 'All correct' }));
  await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(2));
  expect(onCheck).toHaveBeenLastCalledWith(
    expect.objectContaining({
      masteredItemIds: ['line-0', 'line-1'],
    }),
  );
  expect(await screen.findByText('Gamma line')).toBeInTheDocument();
});

it('recalls without textboxes when Settings choose reciting aloud', async () => {
  localStorage.setItem('lacuna.recitationInput', 'aloud');
  renderRecitation();
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByText('line 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText('Alpha line')).toBeInTheDocument();
});

it('ignores Enter while an input method is composing', async () => {
  renderRecitation();
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));
  const box = screen.getByRole('textbox', { name: 'line 1' });
  fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
  expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(await screen.findByRole('button', { name: 'All correct' })).toBeInTheDocument();
});

it('reports the lines in focus as the recitation moves on', async () => {
  const onFocusLines = vi.fn();
  render(
    <SequenceRecitation
      sequence={sequence}
      masteredItemIds={new Set()}
      onCheck={vi.fn().mockResolvedValue(undefined)}
      onFocusLines={onFocusLines}
    />,
  );
  expect(onFocusLines).toHaveBeenLastCalledWith(['line-0']);
  fireEvent.click(await screen.findByRole('button', { name: 'Recite' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'line 1' }), {
    target: { value: 'Alpha line' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  fireEvent.click(screen.getByRole('button', { name: 'All correct' }));
  await waitFor(() => expect(onFocusLines).toHaveBeenLastCalledWith(['line-1']));
  fireEvent.click(screen.getByRole('button', { name: 'Recite' }));
  expect(onFocusLines).toHaveBeenLastCalledWith(['line-0', 'line-1']);
});

it('keeps the sequence title and position available only to screen readers', async () => {
  renderRecitation();
  const title = screen.getByRole('heading', { name: 'Verse' });
  expect(title).toHaveClass('sr-only');
  expect(screen.getByText('Verse 1 of 2, line 1 of 2')).toHaveClass('sr-only');
  expect(await screen.findByText('Alpha line')).toBeVisible();
});
