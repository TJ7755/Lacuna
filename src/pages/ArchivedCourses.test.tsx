import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ArchivedCourses } from './ArchivedCourses';
import type { Course } from '../db/types';

const { mockUpdateCourse, mockNotify } = vi.hoisted(() => ({
  mockUpdateCourse: vi.fn(),
  mockNotify: vi.fn(),
}));
let courses: Course[] | undefined;

vi.mock('../state/useCourseData', () => ({ useCourses: () => courses }));
vi.mock('../db/repository', () => ({ updateCourse: mockUpdateCourse }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ notify: mockNotify }) }));

const archived = {
  id: 'course-1',
  name: 'Finished biology',
  archived: true,
  examDate: Date.now() - 1_000,
  createdAt: 1,
} as Course;

beforeEach(() => {
  localStorage.clear();
  courses = [archived, { ...archived, id: 'active', name: 'Active chemistry', archived: false }];
  mockUpdateCourse.mockReset().mockResolvedValue(undefined);
  mockNotify.mockReset();
});

describe('ArchivedCourses', () => {
  it('uses the eyebrow-free page-header spacing', () => {
    render(<ArchivedCourses />, { wrapper: MemoryRouter });

    expect(screen.getByRole('banner')).toHaveClass('p-7', 'md:p-9');
    expect(screen.getByRole('banner')).not.toHaveClass('p-6', 'md:p-8');
  });

  it('lists only archived courses and restores one explicitly', async () => {
    render(<ArchivedCourses />, { wrapper: MemoryRouter });
    expect(screen.getByText('Finished biology')).toBeInTheDocument();
    expect(screen.queryByText('Active chemistry')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Finished biology' })).toHaveAttribute(
      'href',
      '/course/course-1',
    );
    expect(screen.queryByText('Course library')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive Finished biology' }));
    await waitFor(() =>
      expect(mockUpdateCourse).toHaveBeenCalledWith('course-1', { archived: false }),
    );
    expect(JSON.parse(localStorage.getItem('lacuna.handledFinalExams')!)).toEqual({
      'course-1': archived.examDate,
    });
  });

  it('does not suppress lifecycle handling when restoration fails', async () => {
    mockUpdateCourse.mockRejectedValue(new Error('write failed'));
    render(<ArchivedCourses />, { wrapper: MemoryRouter });

    fireEvent.click(screen.getByRole('button', { name: 'Unarchive Finished biology' }));
    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith('Could not restore Finished biology', 'negative'),
    );
    expect(localStorage.getItem('lacuna.handledFinalExams')).toBe('{}');
  });
});
