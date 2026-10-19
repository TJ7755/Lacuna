import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Course } from '../db/types';
import { TeacherHome } from './TeacherHome';

const state = vi.hoisted(() => ({ courses: undefined as Course[] | undefined }));
const credentials = vi.hoisted(() => vi.fn());
vi.mock('../state/useCourseData', () => ({ useCourses: () => state.courses }));
vi.mock('../shareLinks/credentials', () => ({ readShareCredentials: credentials }));

function course(id: string, extra: Partial<Course> = {}): Course {
  return { id, name: id, ...extra } as Course;
}

function published(id: string, extra: Partial<Course> = {}): Course {
  return course(id, {
    distribution: { lineageId: id, shareId: 'a'.repeat(32), revision: 1, publishedAt: 1 },
    ...extra,
  });
}

function show() {
  return render(
    <MemoryRouter>
      <TeacherHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.courses = [];
  credentials.mockReset().mockResolvedValue({ writeToken: 'b'.repeat(64) });
});

it('distinguishes loading from no published courses', () => {
  state.courses = undefined;
  const view = show();
  expect(screen.getByRole('status')).toHaveTextContent('Loading published courses');
  expect(screen.queryByText('No published courses here')).not.toBeInTheDocument();
  state.courses = [];
  view.rerender(
    <MemoryRouter>
      <TeacherHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'No published courses here' })).toBeInTheDocument();
  expect(screen.getByText(/separate browser storage/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Lacuna' })).toHaveAttribute(
    'href',
    'https://getlacuna.app/#/',
  );
});

it('lists published courses, including archived ones, without pretending to have pupil data', async () => {
  state.courses = [
    course('Draft'),
    course('Imported', {
      distributedCopy: { lineageId: 'x', revision: 1, locked: true, autoAcceptUpdates: false },
    }),
    published('Biology'),
    published('Chemistry', { archived: true }),
  ];
  show();
  expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Draft' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Imported' })).not.toBeInTheDocument();
  expect(screen.getByText('Archived')).toBeInTheDocument();
  expect(
    await screen.findByRole('link', { name: 'Manage sharing for Biology' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/ordinary releases do not send reports yet/)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('does not offer management without the share write credentials', async () => {
  credentials.mockResolvedValue(null);
  state.courses = [published('Biology')];
  show();
  expect(
    await screen.findByText(/Open the browser or desktop app that published this link/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Manage sharing for Biology' }),
  ).not.toBeInTheDocument();
});

it('reports credential-read failures instead of claiming ownership', async () => {
  credentials.mockRejectedValue(new Error('storage unavailable'));
  state.courses = [published('Biology')];
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not check ownership');
  expect(
    screen.queryByRole('link', { name: 'Manage sharing for Biology' }),
  ).not.toBeInTheDocument();
});

it('does not reuse ownership when a course receives a different share link', async () => {
  let resolve!: (value: null) => void;
  state.courses = [published('Biology')];
  const view = show();
  await screen.findByRole('link', { name: 'Manage sharing for Biology' });
  credentials.mockReturnValue(
    new Promise<null>((done) => {
      resolve = done;
    }),
  );
  const original = state.courses[0];
  state.courses = [
    { ...original, distribution: { ...original.distribution!, shareId: 'c'.repeat(32) } },
  ];
  view.rerender(
    <MemoryRouter>
      <TeacherHome />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('link', { name: 'Manage sharing for Biology' }),
  ).not.toBeInTheDocument();
  await act(async () => resolve(null));
  expect(
    await screen.findByText(/Open the browser or desktop app that published this link/),
  ).toBeInTheDocument();
});
