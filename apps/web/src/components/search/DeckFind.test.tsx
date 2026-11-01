import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterModule from 'react-router-dom';
import { LazyMotion, domAnimation } from 'motion/react';
import { expect, it, vi } from 'vitest';
import type { Card, Course, Lesson } from '../../db/types';
import { DeckFind } from './DeckFind';
import type * as MotionSpeedModule from '../../state/motionSpeed';

vi.mock('../../state/motionSpeed', async (importOriginal) => ({
  ...(await importOriginal<typeof MotionSpeedModule>()),
  useMotionSpeed: () => ['normal', vi.fn()],
  speedMultiplier: () => 0,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => navigate,
}));

const course = { id: 'course', name: 'Biology' } as Course;
const lesson = { id: 'lesson', courseId: course.id, name: 'Cells' } as Lesson;
const cards = [
  {
    id: 'primary',
    courseId: course.id,
    primaryLessonId: lesson.id,
    front: 'Cell membrane',
    back: 'Barrier',
  },
  {
    id: 'linked',
    courseId: course.id,
    primaryLessonId: 'other-lesson',
    front: 'Cell wall',
    back: 'Support',
  },
  {
    id: 'unrelated',
    courseId: 'other-course',
    front: 'Cell division elsewhere',
    back: 'Elsewhere',
  },
] as Card[];

function renderFind(findCards = cards) {
  return render(
    <MemoryRouter>
      <LazyMotion features={domAnimation}>
        <DeckFind cards={findCards} course={course} lesson={lesson} />
      </LazyMotion>
    </MemoryRouter>,
  );
}

it('opens the scoped Quick search dialogue, finds primary and linked members only, and restores focus on Escape', async () => {
  renderFind();
  const trigger = screen.getByRole('button', { name: 'Find cards' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'f', ctrlKey: true });
  expect(screen.getByRole('dialog', { name: 'Find cards' })).toBeInTheDocument();
  const input = screen.getByRole('combobox', { name: 'Find cards in this lesson' });
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.change(input, { target: { value: 'Cell' } });
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
  expect(screen.queryByText(/division elsewhere/)).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(navigate).toHaveBeenCalledWith(
    expect.stringContaining('/cards/'),
    expect.objectContaining({ state: expect.objectContaining({ origin: expect.any(Object) }) }),
  );
  navigate.mockClear();

  fireEvent.click(trigger);
  const reopened = screen.getByRole('combobox', { name: 'Find cards in this lesson' });
  fireEvent.keyDown(reopened, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it('hands Ctrl/Cmd+K over to global Quick search with focus back on the opener', async () => {
  // Stands in for AppShell's window listener, which opens Quick search.
  const record: { prevented: boolean; active: Element | null }[] = [];
  const listener = (event: KeyboardEvent) => {
    if (event.key === 'k')
      record.push({ prevented: event.defaultPrevented, active: document.activeElement });
  };
  window.addEventListener('keydown', listener);
  renderFind();
  const trigger = screen.getByRole('button', { name: 'Find cards' });
  fireEvent.click(trigger);
  const input = screen.getByRole('combobox', { name: 'Find cards in this lesson' });
  fireEvent.keyDown(input, { key: 'k', metaKey: true });
  window.removeEventListener('keydown', listener);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(record).toEqual([{ prevented: false, active: trigger }]);
});

it('leaves browser Find alone on a lesson without cards', () => {
  renderFind([]);
  expect(screen.queryByRole('button', { name: 'Find cards' })).not.toBeInTheDocument();
  expect(fireEvent.keyDown(window, { key: 'f', ctrlKey: true })).toBe(true);
});
