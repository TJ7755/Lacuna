import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CourseEntrySection } from './CourseEntrySection';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  notify: vi.fn(),
  data: {
    course: {
      studyStartLessonId: undefined as string | undefined,
      archived: false,
      distributedCopy: { locked: true },
    },
    lessons: [
      { id: 'first', name: 'Year one', isExtension: false },
      { id: 'second', name: 'Year two', isExtension: false },
      { id: 'extra', name: 'Extension', isExtension: true },
    ],
  },
}));
vi.mock('../../state/useLessonOrderData', () => ({ useLessonOrderData: () => mocks.data }));
vi.mock('../../db/courseEntry', () => ({
  setCourseStudyStartLesson: (...args: unknown[]) => mocks.save(...args),
}));
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ notify: mocks.notify }) }));

beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.notify.mockClear();
  mocks.data.course.studyStartLessonId = undefined;
  mocks.data.course.archived = false;
});

it('lets a locked copy choose or reset a core entry point', async () => {
  render(<CourseEntrySection courseId="course" />);
  const picker = screen.getByRole('combobox', { name: 'Start Study from' });
  expect(picker).toBeEnabled();
  expect(screen.queryByRole('option', { name: 'Extension' })).not.toBeInTheDocument();
  fireEvent.change(picker, { target: { value: 'second' } });
  await waitFor(() => expect(picker).toBeEnabled());
  expect(mocks.save).toHaveBeenCalledWith('course', 'second');
  fireEvent.change(picker, { target: { value: '' } });
  await waitFor(() => expect(picker).toBeEnabled());
  expect(mocks.save).toHaveBeenLastCalledWith('course', undefined);
});

it('reports failed saves and explains a removed entry point', async () => {
  mocks.data.course.studyStartLessonId = 'removed';
  mocks.save.mockRejectedValue(new Error('Save failed'));
  render(<CourseEntrySection courseId="course" />);
  expect(screen.getByRole('option', { name: /Starting lesson removed/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } });
  await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('Save failed', 'negative'));
});
