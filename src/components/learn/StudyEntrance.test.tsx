import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StudyEntrance } from './StudyEntrance';

const preference = vi.hoisted(() => ({ multiplier: 1 }));
const release = vi.hoisted(() => vi.fn());
vi.mock('../../state/motionSpeed', () => ({ getMotionMultiplier: () => preference.multiplier }));
vi.mock('../layout/LandingTransition', () => ({ releaseStudyCover: release }));

beforeEach(() => {
  vi.restoreAllMocks();
  preference.multiplier = 1;
  release.mockClear();
});

it('reveals immediately with no animations under reduced motion', () => {
  preference.multiplier = 0;
  const animate = vi.spyOn(Element.prototype, 'animate');
  render(
    <StudyEntrance>
      <header>Session</header>
      <main>
        <button>Continue</button>
      </main>
    </StudyEntrance>,
  );
  expect(release).toHaveBeenCalledTimes(1);
  expect(animate).not.toHaveBeenCalled();
});
