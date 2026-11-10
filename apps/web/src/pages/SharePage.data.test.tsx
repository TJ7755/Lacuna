import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { domAnimation, LazyMotion } from 'motion/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { createCourse, createCourseCard, createLesson } from '../db/repository';
import { db } from '../db/schema';
import { CourseNavigationDataProvider } from '../state/CourseNavigationData';
import { ShellCourseDataProvider } from '../state/ShellCourseData';
import { ToastProvider } from '../components/ui/Toast';
import { SharePage } from './SharePage';

vi.mock('../state/motionSpeed', () => ({
  useMotionSpeed: () => ['none'],
  speedMultiplier: () => 0,
}));

it('opens Share with course counts and a plain-text export without reading review logs', async () => {
  const course = await createCourse('Biology');
  await createLesson(course.id, 'Cells');
  await createCourseCard(course.id, 'front_back', 'What is a cell?', 'Unit of life');
  await createCourse('Chemistry');

  const reviewHistory = vi.spyOn(db.reviewHistory, 'where');
  try {
    render(
      <MemoryRouter initialEntries={['/share']}>
        <LazyMotion features={domAnimation}>
          <ToastProvider>
            <CourseNavigationDataProvider>
              <ShellCourseDataProvider>
                <SharePage />
              </ShellCourseDataProvider>
            </CourseNavigationDataProvider>
          </ToastProvider>
        </LazyMotion>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Course to share' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Biology', description: '1 lesson, 1 card' }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Plain text' }));
    const exportCards = await screen.findByRole('button', { name: 'Export cards as plain text' });
    // The stored card query may settle after the buttons appear.
    await waitFor(() => expect(exportCards).toBeEnabled());
    fireEvent.click(exportCards);
    expect(screen.getByRole('textbox', { name: 'Generated plain-text export' })).toHaveValue(
      'What is a cell?\tUnit of life',
    );
    expect(reviewHistory).not.toHaveBeenCalled();
  } finally {
    reviewHistory.mockRestore();
  }
});
