import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuestionSetRelatedKnowledge } from './QuestionSetRelatedKnowledge';
import { QuestionSetReflection } from './QuestionSetReflection';
const relatedCards = vi.hoisted(() => ({
  current: [
    {
      id: 'card',
      type: 'front_back' as const,
      front: 'What is osmosis?',
      back: 'Movement of water.',
    },
  ],
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => relatedCards.current }));
beforeEach(() => {
  relatedCards.current[0].back = 'Movement of water.';
});
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
  fireEvent.click(screen.getByRole('button', { name: 'Reflection' }));
  fireEvent.click(screen.getByLabelText('Misread the question'));
  expect(onChange).toHaveBeenLastCalledWith({ reasons: ['misread-question'], note: '' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Reflection' }), {
    target: { value: 'Check the command word.' },
  });
  expect(onDirty).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save reflection' }));
  expect(onChange).toHaveBeenLastCalledWith({ reasons: [], note: 'Check the command word.' });
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it.each(['1871.', '1921.', '1.', '0.'])(
  'reveals the complete related-card answer %s',
  async (back) => {
    relatedCards.current[0].back = back;
    const beforeReveal = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <QuestionSetRelatedKnowledge
        courseId="course"
        conceptIds={['concept']}
        submitted
        beforeReveal={beforeReveal}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Related cards' }));
    });
    expect(screen.getByText(back)).toBeInTheDocument();
    expect(container.querySelector('.qs-card-preview ol')).toBeNull();
    expect(beforeReveal).not.toHaveBeenCalled();
  },
);

it('keeps failed assistance hidden and allows a successful retry', async () => {
  const beforeReveal = vi
    .fn()
    .mockRejectedValueOnce(new Error('Save failed'))
    .mockResolvedValue(undefined);
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={['concept']}
      submitted={false}
      beforeReveal={beforeReveal}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Use related cards/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Use related cards/ }));
  expect(await screen.findByText('Movement of water.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Hide related cards' }));
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  expect(beforeReveal).toHaveBeenCalledTimes(2);
});

it('names and tooltips the submitted icon and exposes its expanded state', async () => {
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={['concept']}
      submitted
      beforeReveal={vi.fn()}
    />,
  );
  const trigger = screen.getByRole('button', { name: 'Related cards' });
  expect(trigger).toHaveAttribute('title', 'Related cards');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger.querySelector('svg')).not.toBeNull();
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByRole('dialog', { name: 'Related cards' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
