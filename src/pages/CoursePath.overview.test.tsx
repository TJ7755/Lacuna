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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { domAnimation, LazyMotion } from 'motion/react';
import { ToastProvider } from '../components/ui/Toast';
import { CoursePath } from './CoursePath';

function coursePathSubject() {
  return (
    <MemoryRouter initialEntries={['/course/course-1']}>
      <ToastProvider>
        <LazyMotion features={domAnimation}>
          <Routes>
            <Route path="/course/:courseId" element={<CoursePath />} />
          </Routes>
        </LazyMotion>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('CoursePath overview', () => {
  beforeEach(resetCoursePathFixtures);
  it('opens a lesson straight from its row', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Dynamics' }));
    expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-2');
  });

  it.each([false, true])(
    'creates a lesson through the existing form (empty path=%s)',
    async (empty) => {
      pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
      if (empty) pathState.mockLessons = [];
      renderPage();
      if (empty) {
        expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add first lesson' }));
      } else {
        const add = screen.getByRole('button', { name: 'Add' });
        fireEvent.click(add);
        expect(add).toHaveAttribute('aria-expanded', 'true');
        const options = screen.getByRole('menu', { name: 'Add' });
        expect(add.parentElement).toContainElement(options);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Lesson' }));
      }
      fireEvent.change(screen.getByRole('textbox', { name: 'Lesson name' }), {
        target: { value: 'Energy' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create lesson' }));
      await waitFor(() => expect(mockCreateLesson).toHaveBeenCalledWith('course-1', 'Energy'));
      expect(mockNavigate).toHaveBeenCalledWith('/course/course-1/lesson/lesson-3');
    },
  );
  it('keeps the open first-lesson draft and selection when live lessons arrive', () => {
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
    pathState.mockLessons = [];
    const view = render(coursePathSubject());
    fireEvent.click(screen.getByRole('button', { name: 'Add first lesson' }));
    const input = screen.getByRole('textbox', { name: 'Lesson name' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Fieldwork draft' } });
    input.focus();
    input.setSelectionRange(3, 9);

    for (const lessons of [[lesson1], [lesson1, lesson2]]) {
      pathState.mockLessons = lessons;
      view.rerender(coursePathSubject());
      expect(screen.getByRole('textbox', { name: 'Lesson name' })).toBe(input);
      expect(input).toHaveValue('Fieldwork draft');
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([3, 9]);
    }
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.getByRole('button', { name: 'Dynamics' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
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
    mockReorderLessons.mockResolvedValue(undefined);
    const view = render(coursePathSubject());
    const row = screen.getByRole('button', { name: 'Dynamics' });
    row.focus();
    pathState.mockCourse = { ...course, lessonViewMode: 'edit' };
    view.rerender(coursePathSubject());
    expect(screen.getByRole('button', { name: 'Dynamics' })).toBe(row);
    expect(row).toHaveFocus();
    fireEvent.keyDown(row, {
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
