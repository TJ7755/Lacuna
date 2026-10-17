import { act, render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  beginStudyTransition,
  hasLandingArrival,
  LandingTransition,
  releaseStudyCover,
} from './LandingTransition';

const preference = vi.hoisted(() => ({ multiplier: 1 }));
vi.mock('../../state/motionSpeed', () => ({ getMotionMultiplier: () => preference.multiplier }));
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
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1), { timeout: 100 });
  expect(screen.getByTestId('study-cover')).toBeInTheDocument();
  act(() => releaseStudyCover());
  await vi.waitFor(() => expect(screen.queryByTestId('study-cover')).not.toBeInTheDocument());
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
