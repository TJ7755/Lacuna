import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Course } from '@lacuna/core/db/types';
import { ImportDestination, useImportDestination } from './ImportDestination';

const mocks = vi.hoisted(() => ({ courses: [] as Course[] }));
vi.mock('../../state/useCourseData', () => ({
  useCourses: () => mocks.courses,
  useLessons: () => [{ id: 'greetings', name: 'Greetings' }],
}));

beforeEach(() => {
  mocks.courses = [
    { id: 'french', name: 'French' },
    {
      id: 'published',
      name: 'Published French',
      distributedCopy: {
        lineageId: 'published-french',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    },
    {
      id: 'detached',
      name: 'Detached French',
      distributedCopy: {
        lineageId: 'detached-french',
        revision: 1,
        locked: false,
        autoAcceptUpdates: false,
      },
    },
    { id: 'archived', name: 'Archived French', archived: true },
  ] as Course[];
});

function Destination() {
  const draft = useImportDestination();
  return (
    <>
      <ImportDestination draft={draft} />
      <output aria-label="Resolved destination">{JSON.stringify(draft.destination)}</output>
    </>
  );
}

it('offers ordinary and detached courses while excluding locked and archived courses', () => {
  render(<Destination />);
  expect(screen.getByRole('option', { name: 'French' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Detached French' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Published French' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Archived French' })).not.toBeInTheDocument();
});

it.each(['existing lesson', 'new lesson'])(
  'invalidates a selected %s when its course becomes locked',
  (target) => {
    const view = render(<Destination />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'french' } });
    if (target === 'existing lesson') {
      fireEvent.change(screen.getByLabelText('Lesson'), { target: { value: 'greetings' } });
    } else {
      fireEvent.change(screen.getByLabelText('Lesson title'), { target: { value: 'Verbs' } });
    }
    expect(screen.getByLabelText('Resolved destination')).not.toHaveTextContent('null');

    mocks.courses = mocks.courses.map((course) =>
      course.id === 'french'
        ? { ...course, distributedCopy: mocks.courses[1].distributedCopy }
        : course,
    );
    view.rerender(<Destination />);

    expect(screen.getByLabelText('Resolved destination')).toHaveTextContent('null');
    expect(screen.queryByRole('option', { name: 'French' })).not.toBeInTheDocument();
  },
);
