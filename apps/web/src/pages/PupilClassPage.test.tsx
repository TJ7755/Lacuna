import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Course } from '@lacuna/core/db/types';
import { expectAppDestination } from '../../../../tests/helpers/expectAppDestination';
import { enrolInClass, createEnrolmentSetting } from '../insights/enrolment';
import * as outbox from '../insights/outbox';
import { PupilClassPage } from './PupilClassPage';
import { ToastProvider } from '../components/ui/Toast';

let course: Course | null | undefined;
vi.mock('../state/useCourseData', () => ({ useCourse: () => course }));
vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));
beforeEach(() => {
  localStorage.clear();
  course = {
    id: 'biology',
    name: 'Class biology',
    distributedCopy: { lineageId: 'biology' },
  } as Course;
});
afterEach(() => vi.restoreAllMocks());

function join() {
  enrolInClass('biology', {
    shareId: 'a'.repeat(32),
    lineageId: 'biology',
    recipient: { keyId: 'b'.repeat(64), publicKey: 'public' },
  });
}
function open() {
  render(
    <MemoryRouter initialEntries={['/gaps/biology']}>
      <ToastProvider>
        <Link to="/">Today</Link>
        <Routes>
          <Route
            path="/gaps/:courseId"
            element={
              <div data-route-content="/gaps/biology">
                <PupilClassPage />
              </div>
            }
          />
          <Route
            path="/course/:courseId"
            element={
              <div data-route-content="/course/biology">
                <h1>Class biology</h1>
              </div>
            }
          />
          <Route path="/" element={<h1>Today</h1>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}
it('opens the connected course controls with consent off and a route back to studying', () => {
  join();
  open();
  expect(screen.getByRole('heading', { name: 'Gaps' })).toBeVisible();
  expect(screen.getByText('Class biology')).toBeVisible();
  expect(screen.queryByText(/Connected course/)).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Share insights with your teacher' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(screen.getByText('Nothing has been sent yet.')).toBeVisible();
  expect(createEnrolmentSetting('biology').read()?.consentedAt).toBeNull();
  expectAppDestination(screen.getByRole('link', { name: 'Open course' }), '/course/biology');
});
it.each(['missing', 'archived', 'mismatch', 'not joined'])(
  'does not offer controls for a class that is %s',
  (state) => {
    if (state !== 'not joined') join();
    if (state === 'missing') course = null;
    if (state === 'archived') course = { ...course!, archived: true };
    if (state === 'mismatch')
      course = { ...course!, distributedCopy: { ...course!.distributedCopy!, lineageId: 'other' } };
    open();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expectAppDestination(screen.getByRole('link', { name: 'Join a class' }), '/?import=1&join=1');
  },
);

it('focuses the course heading after disconnect', async () => {
  join();
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect from Gaps' }));
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  const heading = await screen.findByRole('heading', { name: 'Class biology' });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.getByText('Disconnected from Gaps.')).toBeVisible();
});

it('does not return to the course if the pupil leaves during disconnect', async () => {
  join();
  let finishDiscard!: () => void;
  const pending = new Promise<void>((resolve) => {
    finishDiscard = resolve;
  });
  vi.spyOn(outbox, 'createInsightsOutbox').mockReturnValue({
    ...outbox.createInsightsOutbox(),
    discard: () => pending,
  });
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect from Gaps' }));
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
  fireEvent.click(screen.getByRole('link', { name: 'Today' }));
  await act(async () => finishDiscard());
  expect(screen.getByRole('heading', { name: 'Today' })).toBeVisible();
  expect(createEnrolmentSetting('biology').read()).toBeNull();
  expect(screen.queryByText('Disconnected from Gaps.')).not.toBeInTheDocument();
});
