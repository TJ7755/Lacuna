import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyBankRedirect } from './LegacyBankRedirect';

describe('LegacyBankRedirect', () => {
  it('redirects an old Question-bank bookmark to the canonical Cards route', async () => {
    render(
      <MemoryRouter initialEntries={['/course/course-1/bank']}>
        <Routes>
          <Route path="/course/:courseId/bank" element={<LegacyBankRedirect />} />
          <Route path="/course/:courseId/cards" element={<p>Cards page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Cards page')).toBeInTheDocument();
  });
});
