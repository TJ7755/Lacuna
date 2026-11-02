import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  relatedCards.current = [
    { id: 'card', type: 'front_back', front: 'What is osmosis?', back: 'Movement of water.' },
  ];
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
  const trigger = screen.getByRole('button', { name: 'Use related cards' });
  expect(trigger).toHaveAccessibleDescription(
    'Opening these cards records this answer as assisted.',
  );
  fireEvent.click(trigger);
  await act(async () => {});
  expect(beforeReveal).toHaveBeenCalledOnce();
  expect(trigger).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Saving assistance');
  expect(screen.queryByText('What is osmosis?')).not.toBeInTheDocument();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  await act(async () => {
    recorded();
  });
  const dialog = await screen.findByRole('dialog', { name: 'Related cards' });
  expect(within(dialog).getByText('What is osmosis?')).toBeInTheDocument();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  expect(dialog).toHaveTextContent('This answer is recorded as assisted.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Show answer' }));
  expect(within(dialog).getByText('Movement of water.')).toBeInTheDocument();
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
    render(
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
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText(back)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Related cards' }).querySelector('ol')).toBeNull();
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
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('What is osmosis?')).not.toBeInTheDocument();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Use related cards/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Related cards' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(within(dialog).getByText('What is osmosis?')).toBeInTheDocument();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  expect(beforeReveal).toHaveBeenCalledTimes(2);
});

it('names and tooltips the submitted icon and exposes its expanded state', async () => {
  const beforeReveal = vi.fn();
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={['concept']}
      submitted
      beforeReveal={beforeReveal}
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
  expect(beforeReveal).not.toHaveBeenCalled();
});

it('shows one related card at a time and resets answer reveal when moving between cards', async () => {
  relatedCards.current.push(
    {
      id: 'diffusion',
      type: 'front_back',
      front: 'What is diffusion?',
      back: 'Movement of particles.',
    },
    {
      id: 'transport',
      type: 'front_back',
      front: 'What is active transport?',
      back: 'Movement using energy.',
    },
  );
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={['concept']}
      submitted
      beforeReveal={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Related cards' }));
  const dialog = await screen.findByRole('dialog', { name: 'Related cards' });
  const help = within(dialog);
  expect(help.getByRole('status')).toHaveTextContent('Card 1 of 3');
  expect(help.getByRole('button', { name: 'Previous card' })).toBeDisabled();
  fireEvent.click(help.getByRole('button', { name: 'Show answer' }));
  expect(help.getByText('Movement of water.')).toBeInTheDocument();
  fireEvent.click(help.getByRole('button', { name: 'Next card' }));
  expect(help.getByRole('status')).toHaveTextContent('Card 2 of 3');
  expect(help.getByText('What is diffusion?')).toBeInTheDocument();
  expect(help.queryByText('What is osmosis?')).not.toBeInTheDocument();
  expect(help.queryByText('Movement of particles.')).not.toBeInTheDocument();
  fireEvent.click(help.getByRole('button', { name: 'Previous card' }));
  expect(help.queryByText('Movement of water.')).not.toBeInTheDocument();
  fireEvent.click(help.getByRole('button', { name: 'Next card' }));
  fireEvent.click(help.getByRole('button', { name: 'Next card' }));
  expect(help.getByRole('status')).toHaveTextContent('Card 3 of 3');
  expect(help.getByRole('button', { name: 'Next card' })).toBeDisabled();
});

it('resets consultation when the active question part changes', async () => {
  const { rerender } = render(
    <QuestionSetRelatedKnowledge
      key="part-a"
      courseId="course"
      conceptIds={['concept']}
      submitted
      beforeReveal={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Related cards' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show answer' }));
  relatedCards.current = [
    { id: 'different-card', type: 'front_back', front: 'Next part help', back: 'Next part answer' },
  ];
  rerender(
    <QuestionSetRelatedKnowledge
      key="part-b"
      courseId="course"
      conceptIds={['other']}
      submitted
      beforeReveal={vi.fn()}
    />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Related cards' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Related cards' }));
  expect(await screen.findByText('Next part help')).toBeInTheDocument();
  expect(screen.queryByText('Movement of water.')).not.toBeInTheDocument();
  expect(screen.queryByText('Next part answer')).not.toBeInTheDocument();
});

it('offers no help control when there are no related cards', () => {
  relatedCards.current = [];
  const beforeReveal = vi.fn();
  render(
    <QuestionSetRelatedKnowledge
      courseId="course"
      conceptIds={[]}
      submitted={false}
      beforeReveal={beforeReveal}
    />,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(beforeReveal).not.toHaveBeenCalled();
});
