import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createCard, createCourse } from '../db/repository';
import { db } from '../db/schema';
import { ThemeProvider } from '../state/ThemeContext';
import { ToastProvider } from '../components/ui/Toast';
import { LearnMode } from './LearnMode';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
});

describe('study actions during the retained grading pause', () => {
  it.each(['edit', 'exit'])('cancels an uncommitted grade when opening %s', async (action) => {
    const course = await createCourse('Keyboard regression');
    await createCard(course.id, 'front_back', 'First question', 'First answer');
    await createCard(course.id, 'front_back', 'Second question', 'Second answer');
    render(
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/learn']}>
            <Routes>
              <Route path="/learn" element={<LearnMode />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>,
    );
    const reveal = await screen.findByText(/^show answer$/i, { selector: 'button' });
    fireEvent.click(reveal);
    const yes = await screen.findByRole('button', { name: 'Yes' });
    yes.focus();
    fireEvent.click(yes);
    if (action === 'edit') {
      fireEvent.keyDown(window, { key: 'e' });
      await screen.findByRole('textbox', { name: 'Front' });
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
      await screen.findByRole('dialog', { name: 'Leave this session?' });
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
    expect(await db.reviewHistory.count()).toBe(0);
    if (action === 'edit') {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.getByRole('main', { name: 'Study card' })).toHaveFocus());
    }
  });
});
