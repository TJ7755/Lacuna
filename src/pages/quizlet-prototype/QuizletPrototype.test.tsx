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
it('shows the review history and today’s decision in A’s exam graph', () => {
  open('A');
  const graph = screen.getByRole('img', { name: /Predicted recall/ });
  expect(within(graph).getByText('14 days ago')).toBeInTheDocument();
  expect(within(graph).getByText('Review today')).toBeInTheDocument();
  expect(within(graph).getByText('0%')).toBeInTheDocument();
  expect(graph.querySelector('.qc-recall-history')).toBeInTheDocument();
});
it('cycles between three complete comparison journeys', () => {
  open();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remember it on exam day.');
  expect(
    screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Keep the work. Change the workflow.' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Your exam date changes what you study today.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Know it when exam day arrives.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next prototype' }));
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remember it on exam day.');
});
it.each(['A', 'B', 'C'])('keeps decorative labels out of prototype %s', (variant) => {
  open(variant);
  expect(
    document.querySelector(
      '.qc-eyebrow, .qc-kicker, .qc-guide-byline, .qc-verdict-pills, .qc-orbit-stamp, .qc-floating-chip, .qc-tour-caption, .qc-lab-meta, .qc-lab-footer, figcaption',
    ),
  ).toBeNull();
  expect(
    screen.queryByText(
      /A practical comparison|Independent comparison|real app views|The short version|Actual app|Captured 27 Sep/i,
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(
    screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' }),
  ).toBeInTheDocument();
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
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Know it when exam day arrives.',
  );
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

it.each(['A', 'B', 'C'])('puts exam scheduling in the opening section of %s', (variant) => {
  open(variant);
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
  expect(within(hero).getByRole('combobox', { name: 'Example exam date' })).toBeInTheDocument();
  expect(within(hero).getByText('Review where it helps most.')).toBeInTheDocument();
  const before = within(hero)
    .getByRole('img', { name: /Predicted recall/ })
    .getAttribute('aria-label');
  fireEvent.change(within(hero).getByRole('combobox', { name: 'Example exam date' }), {
    target: { value: '7' },
  });
  expect(
    within(hero)
      .getByRole('img', { name: /Predicted recall/ })
      .getAttribute('aria-label'),
  ).not.toBe(before);
});

it('embeds the study card renderer in A and reveals a real card face', async () => {
  open('A');
  const practice = document.getElementById('practice')!;
  const reveal = within(practice).getAllByRole('button', { name: 'Show answer' });
  fireEvent.click(reveal.find((button) => button.tagName === 'BUTTON')!);
  expect(await within(practice).findByRole('button', { name: 'Hide answer' })).toBeInTheDocument();
  expect(practice.querySelector('[data-study-face="back"]')).toHaveTextContent(
    'biological catalyst',
  );
  fireEvent.click(within(practice).getByRole('button', { name: 'Cloze' }));
  expect(practice.querySelector('[data-study-face="front"]')).toHaveTextContent('[...]');
});

it('puts exam scheduling first in A’s comparison and keeps evidence available', () => {
  open('A');
  const table = screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' });
  const firstFeature = within(table).getAllByRole('rowheader')[0];
  expect(firstFeature).toHaveTextContent('Study direction');
  fireEvent.click(within(firstFeature).getByRole('button'));
  expect(within(table).getByRole('link', { name: 'Quizlet source' })).toHaveAttribute(
    'href',
    expect.stringContaining('Studying-with-Learn'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Moving over' }));
  expect(within(table).getByText('Bringing your sets')).toBeInTheDocument();
  expect(within(table).queryByText('Study direction')).not.toBeInTheDocument();
});

it('shows course structure and memory diagrams in A without implying Quizlet lacks recall tracking', () => {
  open('A');
  const table = screen.getByRole('table', { name: 'Lacuna and Quizlet feature comparison' });
  expect(within(table).getAllByRole('rowheader')[1]).toHaveTextContent('Organising material');
  expect(
    within(table).getByRole('img', { name: 'Lacuna: course, lessons, notes, cards and questions' }),
  ).toHaveTextContent('Questions');
  expect(
    within(table).getByRole('img', { name: 'Quizlet: folders organise sets and Study Guides' }),
  ).toHaveTextContent('folder');
  expect(
    within(table).getByRole('img', {
      name: 'Lacuna: review history updates a card’s memory model and next review',
    }),
  ).toHaveTextContent('Memory model');
  expect(
    within(table).getByRole('img', { name: 'Quizlet: recall ratings inform scheduled reviews' }),
  ).toHaveTextContent('Recall rating');
  fireEvent.click(screen.getByRole('button', { name: 'Moving over' }));
  expect(
    within(table).getByRole('img', { name: 'Lacuna: imported cards build a new review history' }),
  ).toBeInTheDocument();
  expect(
    within(table).getByRole('img', {
      name: 'Quizlet: text export includes terms and definitions, not review history',
    }),
  ).toBeInTheDocument();
  expect(
    within(table).queryByRole('img', {
      name: 'Lacuna: course, lessons, notes, cards and questions',
    }),
  ).not.toBeInTheDocument();
});

it('explains account-free course sharing for teachers in A', () => {
  open('A');
  const teachers = screen.getByRole('region', {
    name: 'For teachers. A course link, not a class of logins.',
  });
  expect(within(teachers).getByText('No teacher or student accounts')).toBeInTheDocument();
  expect(
    within(teachers).getByRole('img', {
      name: 'One teacher shares a course link; each student keeps their own study progress',
    }),
  ).toBeInTheDocument();
  fireEvent.click(within(teachers).getByRole('button', { name: 'Course updates' }));
  expect(within(teachers).getByText('Republish to the same link')).toBeInTheDocument();
  expect(within(teachers).getByText('Existing review history is preserved')).toBeInTheDocument();
  expect(within(teachers).getByRole('link', { name: 'Open course sharing' })).toHaveAttribute(
    'href',
    '/share',
  );
});
