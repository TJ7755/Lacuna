import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StandaloneTeacherHome } from './StandaloneTeacherHome';

const course = { shareId: 'a'.repeat(32), courseName: 'Biology', verifiedAt: 0 };
vi.mock('./TeacherCourses', () => ({
  TeacherCourses: ({
    onOpenClass,
    onPrepareKey,
  }: {
    onOpenClass(selected: typeof course): void;
    onPrepareKey(selected: typeof course): void;
  }) => (
    <section>
      <h2 tabIndex={-1}>Your classes</h2>
      <button onClick={() => onOpenClass(course)}>Open class</button>
      <button onClick={() => onPrepareKey(course)}>Set up class</button>
    </section>
  ),
}));
vi.mock('./TeacherClassReports', () => ({
  TeacherClassReports: ({ onClose }: { onClose(): void }) => (
    <section>
      <h2 tabIndex={-1}>Biology reports</h2>
      <button onClick={onClose}>Close and lock</button>
    </section>
  ),
}));
vi.mock('./TeacherKeySetup', () => ({
  TeacherKeySetup: ({
    initialCourse,
    onContinue,
  }: {
    initialCourse?: string;
    onContinue?(): void;
  }) => (
    <section>
      <h2 tabIndex={-1}>Protect {initialCourse}</h2>
      <button onClick={onContinue}>Continue to class</button>
    </section>
  ),
}));

it('shows only the selected workspace and returns focus to the class list after close', async () => {
  render(<StandaloneTeacherHome />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open class' }));
  const heading = await screen.findByRole('heading', { name: 'Biology reports' });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(screen.queryByRole('heading', { name: 'Your classes' })).not.toBeInTheDocument();
  expect(
    screen.queryByText('Recover a class or save another recovery file'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close and lock' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Your classes' })).toHaveFocus());
  expect(screen.queryByRole('heading', { name: 'Biology reports' })).not.toBeInTheDocument();
});

it('carries the selected class through setup and into its locked report workspace', async () => {
  render(<StandaloneTeacherHome />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set up class' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: `Protect ${course.shareId}` })).toHaveFocus(),
  );
  expect(screen.queryByRole('button', { name: 'Open class' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to class' }));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Biology reports' })).toHaveFocus(),
  );
});
