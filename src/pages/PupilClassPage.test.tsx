import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Course } from '../db/types';
import { expectAppDestination } from '../../tests/helpers/expectAppDestination';
import { enrolInClass, createEnrolmentSetting } from '../insights/enrolment';
import { PupilClassPage } from './PupilClassPage';

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
      <Routes>
        <Route path="/gaps/:courseId" element={<PupilClassPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it('opens the connected course controls with consent off and a route back to studying', () => {
  join();
  open();
  expect(screen.getByRole('heading', { name: 'Gaps' })).toBeVisible();
  expect(screen.getByText('Class biology')).toBeVisible();
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
