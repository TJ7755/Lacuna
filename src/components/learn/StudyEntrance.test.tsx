import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StudyEntrance } from './StudyEntrance';

const preference = vi.hoisted(() => ({ multiplier: 1 }));
const release = vi.hoisted(() => vi.fn());
vi.mock('../../state/motionSpeed', () => ({ getMotionMultiplier: () => preference.multiplier }));
vi.mock('../layout/LandingTransition', () => ({
  releaseStudyCover: release,
  hasLandingArrival: () => false,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  preference.multiplier = 1;
  release.mockClear();
});

it('reveals ready content with a header fade and three short staggered rises', () => {
  const cancel = vi.fn();
  const handled = vi.fn();
  const animate = vi
    .spyOn(Element.prototype, 'animate')
    .mockReturnValue({ cancel, finished: { then: handled } } as unknown as Animation);
  const { container, unmount } = render(
    <StudyEntrance>
      <header>Session</header>
      <main>
        <section>One</section>
        <section>Two</section>
        <section>Three</section>
        <section>Four</section>
      </main>
    </StudyEntrance>,
  );
  expect(release).toHaveBeenCalledTimes(1);
  expect(animate).toHaveBeenCalledTimes(4);
  expect(animate.mock.calls[0]).toEqual([[{ opacity: 0 }, { opacity: 1 }], { duration: 140 }]);
  expect(animate.mock.calls.slice(1).map((call) => call[1])).toEqual(
    [20, 60, 100].map((delay) => ({
      duration: 220,
      delay,
      fill: 'backwards',
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    })),
  );
  expect(animate.mock.calls[1]?.[0]).toEqual([
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'none' },
  ]);
  expect(container.firstChild).not.toHaveStyle({ transform: 'translateY(0px)' });
  unmount();
  expect(cancel).toHaveBeenCalledTimes(4);
  expect(handled).toHaveBeenCalledTimes(4);
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
