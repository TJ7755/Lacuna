import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import QuizletPrototype from './QuizletPrototype';

function open(variant = 'A') {
  render(
    <MemoryRouter initialEntries={[`/prototype/quizlet?variant=${variant}`]}>
      <QuizletPrototype />
    </MemoryRouter>,
  );
}
it('cycles between three complete comparison journeys', () => {
  open();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'More than a set of flashcards.',
  );
  expect(
    screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Keep the work. Change the workflow.' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'A different way to get ready.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Find your way to ready.');
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'More than a set of flashcards.',
  );
});
it('filters the comparison without losing source evidence', () => {
  open('B');
  fireEvent.click(screen.getByRole('button', { name: 'Moving over' }));
  const table = screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' });
  expect(within(table).getByText('Bringing your sets')).toBeInTheDocument();
  expect(within(table).queryByText('Spaced repetition')).not.toBeInTheDocument();
  expect(within(table).getAllByRole('link', { name: /Source/ })[0]).toHaveAttribute(
    'href',
    expect.stringContaining('Exporting-your-sets'),
  );
});
it('previews pasted cards and leaves arrow keys available in the input', () => {
  open('C');
  const input = screen.getByRole('textbox', { name: 'Example terms and definitions' });
  fireEvent.change(input, {
    target: { value: 'Mitosis\tCell division\nOsmosis\tMovement of water' },
  });
  expect(screen.getByText('2 cards ready to preview')).toBeInTheDocument();
  expect(screen.getByText('Cell division')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Find your way to ready.');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByText('Add a term and definition to see the preview.')).toBeInTheDocument();
});
it('lets the visitor try application practice and switch priorities', () => {
  open('C');
  fireEvent.click(screen.getByRole('button', { name: 'Practise applying ideas' }));
  expect(
    screen.getByRole('heading', { name: 'Knowing it is the starting point.' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Application' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
  expect(screen.getByText('Choose an answer first.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'The active site changes shape' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
  expect(screen.getByText(/Correct. High temperatures/)).toBeInTheDocument();
});
