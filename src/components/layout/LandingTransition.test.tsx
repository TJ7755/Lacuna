import { act, fireEvent, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  beginStudyTransition,
  hasLandingArrival,
  LandingTransition,
  releaseStudyCover,
} from './LandingTransition';

const preference = vi.hoisted(() => ({ multiplier: 1 }));
vi.mock('../../state/motionSpeed', () => ({
  getMotionMultiplier: () => preference.multiplier,
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => preference.multiplier,
}));
beforeEach(() => {
  sessionStorage.clear();
  preference.multiplier = 1;
});

it('keeps study covered through navigation until the session is ready', async () => {
  render(
    <LazyMotion features={domAnimation}>
      <LandingTransition />
    </LazyMotion>,
  );
  const navigate = vi.fn(() => expect(hasLandingArrival()).toBe(true));
  act(() =>
    beginStudyTransition(
      new DOMRect(20, 40, 400, 300),
      { colour: 'white', radius: '24px', paper: 'white' },
      navigate,
    ),
  );
  expect(screen.getByTestId('study-cover')).toBeInTheDocument();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(screen.getByTestId('study-cover')).toBeInTheDocument();
  act(() => releaseStudyCover());
  expect(screen.queryByTestId('study-cover')).not.toBeInTheDocument();
  expect(hasLandingArrival()).toBe(false);
});

it('navigates immediately without a cover or arrival flag at multiplier zero', () => {
  preference.multiplier = 0;
  render(
    <LazyMotion features={domAnimation}>
      <LandingTransition />
    </LazyMotion>,
  );
  const navigate = vi.fn();
  act(() =>
    beginStudyTransition(
      new DOMRect(20, 40, 400, 300),
      { colour: 'white', radius: '24px', paper: 'white' },
      navigate,
    ),
  );
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(hasLandingArrival()).toBe(false);
  expect(screen.queryByTestId('study-cover')).not.toBeInTheDocument();
});

it('Escape cancels a covered launch while its destination is pending', async () => {
  render(
    <LazyMotion features={domAnimation}>
      <LandingTransition />
    </LazyMotion>,
  );
  const navigate = vi.fn();
  const cancel = vi.fn();
  act(() =>
    beginStudyTransition(
      new DOMRect(20, 40, 400, 300),
      { colour: 'white', radius: '24px', paper: 'white' },
      navigate,
      cancel,
    ),
  );
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce(), { timeout: 2000 });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('study-cover')).not.toBeInTheDocument();
  expect(hasLandingArrival()).toBe(false);
});
