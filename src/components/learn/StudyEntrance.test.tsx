import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// Setup resolves inside the entrance boundary, without rerendering that boundary.
function LoadingStudy() {
  const [ready, setReady] = useState(false);
  return ready ? (
    <main>
      <h1>Revision plan</h1>
      <button>Start revision</button>
    </main>
  ) : (
    <button onClick={() => setReady(true)}>Resolve local plan</button>
  );
}

it.each([0, 1])(
  'keeps the launch cover until internally loaded content is ready at motion %s',
  async (multiplier) => {
    preference.multiplier = multiplier;
    render(
      <StudyEntrance>
        <LoadingStudy />
      </StudyEntrance>,
    );
    expect(release).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve local plan' }));
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Start revision' })).toBeEnabled();
  },
);
