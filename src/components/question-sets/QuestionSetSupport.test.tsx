import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { QuestionSetRelatedKnowledge } from './QuestionSetRelatedKnowledge';
import { QuestionSetReflection } from './QuestionSetReflection';
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => [{ id: 'card', front: 'What is osmosis?', back: 'Movement of water.' }],
}));
it('does not reveal related knowledge until recording assistance succeeds', async () => {
  let recorded!: () => void;
  const beforeReveal = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        recorded = resolve;
      }),
  );
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={['concept']}
      submitted={false}
      beforeReveal={beforeReveal}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Use related cards/ }));
  expect(beforeReveal).toHaveBeenCalledOnce();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  await act(async () => {
    recorded();
  });
  expect(await screen.findByText('Movement of water.')).toBeInTheDocument();
});
it('keeps reflection optional and saves it separately from answer evidence', () => {
  const onChange = vi.fn();
  const onDirty = vi.fn();
  render(
    <QuestionSetReflection
      value={{ reasons: [], note: '' }}
      busy={false}
      onChange={onChange}
      onDirty={onDirty}
    />,
  );
  fireEvent.click(screen.getByText('What would you change?'));
  fireEvent.click(screen.getByLabelText('Misread the question'));
  expect(onChange).toHaveBeenLastCalledWith({ reasons: ['misread-question'], note: '' });
  fireEvent.change(screen.getByLabelText('Reflection'), {
    target: { value: 'Check the command word.' },
  });
  expect(onDirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
  expect(onChange).toHaveBeenLastCalledWith({ reasons: [], note: 'Check the command word.' });
  expect(onDirty).toHaveBeenLastCalledWith(false);
});
