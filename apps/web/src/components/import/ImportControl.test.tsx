import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ImportControl } from './ImportControl';

vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
vi.mock('../../routes/prefetch', () => ({ prefetchRoute: vi.fn() }));
vi.mock('./ImportPanel', () => ({
  ImportPanel: ({
    onClose,
    onBusyChange,
  }: {
    onClose: () => void;
    onBusyChange: (busy: boolean) => void;
  }) => (
    <section aria-label="Import sources">
      <button onClick={onClose}>Cancel import</button>
      <button onClick={() => onBusyChange(true)}>Start import</button>
    </section>
  ),
}));
function Location() {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
    </output>
  );
}
function renderControl(entry = '/') {
  render(
    <LazyMotion features={domAnimation}>
      <MemoryRouter initialEntries={[entry]}>
        <ImportControl />
        <Location />
      </MemoryRouter>
    </LazyMotion>,
  );
}
it('expands on Today and returns focus to its trigger on close', async () => {
  renderControl();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible());
  expect(screen.getByRole('status')).toHaveTextContent('/');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel import' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Import sources' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus();
});
it('opens linked imports and prevents closing during a write', async () => {
  renderControl('/?import=1');
  fireEvent.click(await screen.findByRole('button', { name: 'Start import' }));
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('region', { name: 'Import sources' })).toBeVisible();
});

it('clears the class-entry request when closing so ordinary Import reopens its sources', async () => {
  renderControl('/?import=1&join=1');
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel import' }));
  expect(screen.getByRole('status')).toHaveTextContent(/^\/$/);
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.getByRole('status')).toHaveTextContent('/?import=1');
});
