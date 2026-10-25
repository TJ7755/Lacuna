import {
  mockNavigate,
  mockCreateLesson,
  mockReorderLessons,
  course,
  lesson1,
  lesson2,
  renderPage,
  resetCoursePathFixtures,
  pathState,
} from './CoursePath.testFixtures';
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
describe('CoursePath overview', () => {
  beforeEach(resetCoursePathFixtures);
  it('opens a lesson straight from its row', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dynamics' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-2');
  });

  it('expands Add in place and creates a real lesson through its existing form', async () => {
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
    renderPage();
    const add = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(add);
    expect(add).toHaveAttribute('aria-expanded', 'true');
    const options = screen.getByRole('menu', { name: 'Add' });
    expect(add.parentElement).toContainElement(options);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lesson' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson name' }), {
      target: { value: 'Energy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));
    await waitFor(() => expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Energy'));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
  });
  it('shows the lock reason without opening an unreached lesson in View mode', () => {
    pathState.mockCourse = { ...course, unlockMode: 'semi-linear' };
    renderPage();
    const locked = screen.getByRole('button', { name: 'Dynamics' });
    expect(locked).toHaveTextContent(/Unlocks once the lesson before it is complete/);
    expect(locked).toBeDisabled();
    fireEvent.click(locked);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('retains keyboard lesson reordering in Edit mode', async () => {
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
    mockReorderLessons.mockResolvedValue(undefined);
    renderPage();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dynamics' }), {
      key: 'ArrowUp',
      altKey: true,
    });
    await waitFor(() =>
      expect(mockReorderLessons).toHaveBeenCalledWith('course-1', ['lesson-2', 'lesson-1']),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('dismisses Add with Escape or an outside press and restores its focus', () => {
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
    renderPage();
    const add = screen.getByRole('button', { name: 'Add' });
    add.focus();
    fireEvent.click(add);
    fireEvent.keyDown(add, { key: 'Escape' });
    expect(add).toHaveAttribute('aria-expanded', 'false');
    expect(add).toHaveFocus();
    expect(screen.queryByRole('menu', { name: 'Add' })).not.toBeInTheDocument();
    fireEvent.click(add);
    fireEvent.pointerDown(document.body);
    expect(add).toHaveAttribute('aria-expanded', 'false');
    expect(mockCreateLesson).not.toHaveBeenCalled();
  });
  it('explains a suspended saved order on the path without enabling locked authoring', () => {
    pathState.mockCourse = {
      ...course,
      localLessonOrder: [lesson2.id, lesson1.id],
      autoPractice: true,
      distributedCopy: {
        lineageId: 'science',
        revision: 1,
        locked: true,
        autoAcceptUpdates: false,
      },
    };
    renderPage();
    expect(screen.getByText(/Saved lesson order is suspended/)).toHaveTextContent(
      'Turn off automatic Card practice',
    );
    expect(screen.queryByRole('button', { name: /Add lesson/i })).not.toBeInTheDocument();
  });
});
