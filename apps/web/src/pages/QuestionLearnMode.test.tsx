import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { QuestionLearnMode } from './QuestionLearnMode';

it('redirects old individual-session bookmarks to the shared Questions library', async () => {
  render(
    <MemoryRouter initialEntries={['/course/course/questions/learn?mode=all-due']}>
      <Routes>
        <Route path="/course/:courseId/questions/learn" element={<QuestionLearnMode />} />
        <Route path="/course/:courseId/questions" element={<h1>Question sets</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: 'Question sets' })).toBeVisible();
});
