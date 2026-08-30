import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FsrsOptimise from '../../fsrs/optimise';
import { defaultFsrsParameters } from '../../fsrs/params';
import { MIN_OPTIMISE_REVIEWS } from '../../fsrs/optimise';
import { OptimisationPanel } from './OptimisationPanel';

const optimiser = vi.hoisted(() => ({
  reset: vi.fn(),
  run: vi.fn(),
}));
const panelState = vi.hoisted(() => ({
  enabled: true,
  reviews: 1_000,
}));
const notify = vi.hoisted(() => vi.fn());

vi.mock('../../state/useOptimiser', () => ({
  useOptimiser: () => ({
    status: 'idle',
    progress: 0,
    result: null,
    error: null,
    reset: optimiser.reset,
    run: optimiser.run,
  }),
}));

vi.mock('../../state/optimiseSetting', () => ({
  useAutoOptimiseDefault: () => [true, vi.fn()],
  optimiseEnabledForDeck: () => panelState.enabled,
}));

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 1,
}));

vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ notify }),
}));

vi.mock('../../db/backups', () => ({ takeAutoBackup: vi.fn() }));

vi.mock('../../fsrs/optimise', async () => {
  const actual = await vi.importActual<typeof FsrsOptimise>('../../fsrs/optimise');
  return { ...actual, countReviews: () => panelState.reviews };
});

function customParameters() {
  const parameters = defaultFsrsParameters();
  parameters.w = parameters.w.map((weight, index) => (index === 0 ? weight + 0.01 : weight));
  return parameters;
}

describe('OptimisationPanel', () => {
  beforeEach(() => {
    panelState.enabled = true;
    panelState.reviews = MIN_OPTIMISE_REVIEWS;
    optimiser.reset.mockClear();
    optimiser.run.mockClear();
    notify.mockClear();
  });

  it('gives the optimisation disclosure a distinct accessible name', () => {
    render(
      <OptimisationPanel
        entity={{ id: 'course-1', fsrsParameters: customParameters() }}
        cards={[]}
        onUpdate={vi.fn()}
        entityLabel="course"
        headingLevel={3}
      />,
    );

    const summary = screen.getByLabelText('Scheduling optimisation');
    const disclosure = summary.closest('details');

    expect(disclosure).not.toHaveAttribute('open');
    expect(screen.getByText('Advanced scheduling')).not.toBe(summary);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Scheduling optimisation' }),
    ).toBeInTheDocument();

    fireEvent.click(summary);
    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeInTheDocument();
  });

  it.each([
    ['optimisation is disabled', false, MIN_OPTIMISE_REVIEWS],
    ['there is insufficient review history', true, 0],
  ])('keeps reset available when %s', async (_label, enabled, reviews) => {
    panelState.enabled = enabled;
    panelState.reviews = reviews;
    const onUpdate = vi.fn();

    render(
      <OptimisationPanel
        entity={{ id: 'course-1', fsrsParameters: customParameters() }}
        cards={[]}
        onUpdate={onUpdate}
        entityLabel="course"
      />,
    );

    fireEvent.click(screen.getByLabelText('Scheduling optimisation'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        fsrsParameters: defaultFsrsParameters(),
      }),
    );
  });

  it('omits reset when the current weights already match the defaults', () => {
    render(
      <OptimisationPanel
        entity={{ id: 'course-1', fsrsParameters: defaultFsrsParameters() }}
        cards={[]}
        onUpdate={vi.fn()}
        entityLabel="course"
      />,
    );

    fireEvent.click(screen.getByLabelText('Scheduling optimisation'));
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument();
  });

  it('reports a failed reset without discarding the current optimiser state', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('IndexedDB refused the update.'));
    render(
      <OptimisationPanel
        entity={{ id: 'course-1', fsrsParameters: customParameters() }}
        cards={[]}
        onUpdate={onUpdate}
        entityLabel="course"
      />,
    );

    fireEvent.click(screen.getByLabelText('Scheduling optimisation'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('IndexedDB refused the update.', 'negative'),
    );
    expect(optimiser.reset).not.toHaveBeenCalled();
  });
});
