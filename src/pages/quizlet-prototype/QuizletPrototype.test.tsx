import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import QuizletPrototype from './QuizletPrototype';

it('switches between distinct prototypes and lets the learner explore the course', () => {
  render(
    <MemoryRouter initialEntries={['/prototype/quizlet?variant=A']}>
      <QuizletPrototype />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: /Your exam has a date/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { name: /Both do flashcards/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { name: /See the bigger picture/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /03.*Apply/ }));
  expect(screen.getByText('Why does temperature change enzyme activity?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { name: /Your exam has a date/ })).toBeTruthy();
});
