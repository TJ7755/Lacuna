import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
import { QuizletComparison } from './QuizletComparison';

function open() {
  render(<QuizletComparison />);
}
it('shows review history and updates the forecast for the selected example card', () => {
  open();
  const graph = screen.getByRole('img', { name: /Predicted recall/ });
  expect(within(graph).getByText('14 days ago')).toBeInTheDocument();
  expect(within(graph).getByText('Review today')).toBeInTheDocument();
  expect(within(graph).getByText('0%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Cell structure/ }));
  expect(graph).toHaveAccessibleName(/Predicted recall for Cell structure/);
});
it('previews pasted cards and leaves arrow keys available in the input', () => {
  open();
  const input = screen.getByRole('textbox', { name: 'Example terms and definitions' });
  fireEvent.change(input, {
    target: { value: 'Mitosis\tCell division\nOsmosis\tMovement of water' },
  });
  expect(screen.getByText('2 cards ready to preview')).toBeInTheDocument();
  expect(screen.getByText('Cell division')).toBeInTheDocument();
  const heading = screen.getByRole('heading', { level: 1 });
  const title = heading.textContent;
  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(input).toHaveFocus();
  expect(input).toHaveValue('Mitosis\tCell division\nOsmosis\tMovement of water');
  expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
  expect(heading.textContent).toBe(title);
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.getByText('Add a term and definition to see the preview.')).toBeInTheDocument();
});
it('puts exam scheduling in the opening section', () => {
  open();
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
  expect(within(hero).getByRole('combobox', { name: 'Example exam date' })).toBeInTheDocument();
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

it('switches the teacher sharing example and restores the first share in A', async () => {
  open();
  const teachers = screen.getByRole('region', {
    name: /^For teachers\b/,
  });
  const panel = teachers.querySelector('[aria-live="polite"]')!;
  const firstShare = within(teachers).getByRole('button', { name: 'First share' });
  const courseUpdates = within(teachers).getByRole('button', { name: 'Course updates' });
  expect(panel).toBeVisible();
  const initialContent = panel.textContent!.trim();
  expect(initialContent).toMatch(/\S/);
  expect(firstShare).toHaveAttribute('aria-pressed', 'true');
  expect(courseUpdates).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(courseUpdates);
  expect(firstShare).toHaveAttribute('aria-pressed', 'false');
  expect(courseUpdates).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => {
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent(/\S/);
    expect(panel.textContent!.trim(), 'updates must change the announced example').not.toBe(
      initialContent,
    );
  });

  fireEvent.click(firstShare);
  expect(firstShare).toHaveAttribute('aria-pressed', 'true');
  expect(courseUpdates).toHaveAttribute('aria-pressed', 'false');
  await waitFor(() => {
    expect(panel).toBeVisible();
    expect(panel.textContent!.trim()).toBe(initialContent);
  });
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
  const heading = screen.getByRole('heading', { level: 1 });
  const title = heading.textContent;
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
  expect(heading.textContent).toBe(title);
});
