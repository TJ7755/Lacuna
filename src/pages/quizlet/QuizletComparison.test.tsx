import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
import { QuizletComparison } from './QuizletComparison';

function open() {
  render(<QuizletComparison />);
}
it('shows the review history and today’s decision in A’s exam graph', () => {
  open();
  const graph = screen.getByRole('img', { name: /Predicted recall/ });
  expect(within(graph).getByText('14 days ago')).toBeInTheDocument();
  expect(within(graph).getByText('Review today')).toBeInTheDocument();
  expect(within(graph).getByText('0%')).toBeInTheDocument();
  expect(graph.querySelector('.qc-recall-history')).toBeInTheDocument();
});
it('keeps decorative labels out of the public page', () => {
  open();
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
it('previews pasted cards and leaves arrow keys available in the input', () => {
  open();
  const input = screen.getByRole('textbox', { name: 'Example terms and definitions' });
  fireEvent.change(input, {
    target: { value: 'Mitosis\tCell division\nOsmosis\tMovement of water' },
  });
  expect(screen.getByText('2 cards ready to preview')).toBeInTheDocument();
  expect(screen.getByText('Cell division')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remember it on exam day.');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByText('Add a term and definition to see the preview.')).toBeInTheDocument();
});
it('puts exam scheduling in the opening section', () => {
  open();
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
  open();
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
  open();
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
  open();
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
  open();
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
    '/#/share',
  );
});

it('links to the app, pauses animation and has no prototype navigation', () => {
  open();
  expect(screen.queryByRole('navigation', { name: 'Prototype variants' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Open Lacuna' })[0]).toHaveAttribute('href', '/#/');
  fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
  expect(document.querySelector('.qc-page')).toHaveClass('qc-paused');
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remember it on exam day.');
});
