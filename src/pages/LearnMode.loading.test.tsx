import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ThemeProvider } from '../state/ThemeContext';
import { ToastProvider } from '../components/ui/Toast';
import { createCourse, createLesson, createLessonCard } from '../db/repository';
import * as courseData from '../state/useCourseData';
import { LearnMode } from './LearnMode';

it('waits for the lesson course before initialising the study session', async () => {
  const course = await createCourse('Direct study', { learnFirst: false });
  const lesson = await createLesson(course.id, 'Delayed lesson');
  await createLessonCard(course.id, lesson.id, 'front_back', 'Question', 'Answer');
  const originalUseCourse = courseData.useLessonCourse;
  let held = true;
  let courseLoaded = false;
  const courseSpy = vi.spyOn(courseData, 'useLessonCourse').mockImplementation((id) => {
    const result = originalUseCourse(id);
    courseLoaded = result?.id === course.id;
    return held ? undefined : result;
  });
  const view = () => (
    <ThemeProvider><ToastProvider>
      <MemoryRouter initialEntries={[`/lesson/${lesson.id}/learn`]}>
        <Routes><Route path="/lesson/:lessonId/learn" element={<LearnMode />} /></Routes>
      </MemoryRouter>
    </ToastProvider></ThemeProvider>
  );
  const rendered = render(view());
  try {
    await waitFor(() => expect(courseLoaded).toBe(true));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(screen.queryByRole('heading', { name: 'Delayed lesson' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
    held = false;
    rendered.rerender(view());
    expect(await screen.findByRole('heading', { name: 'Delayed lesson' })).toBeInTheDocument();
  } finally {
    rendered.unmount();
    courseSpy.mockRestore();
  }
});
