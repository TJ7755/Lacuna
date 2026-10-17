import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { QuestionSetResponseEditor } from './QuestionSetResponseEditor';
import type { QuestionAnswer } from '../../questions/questionSets';

function Answer({ id }: { id: string }) {
  const [answer, setAnswer] = useState<QuestionAnswer>({
    maxMarks: 1,
    allocations: [],
    prerequisiteConceptIds: [],
    response: {
      kind: 'multiple-choice',
      selection: 'single',
      options: [
        { id: `${id}-a`, content: 'First' },
        { id: `${id}-b`, content: 'Second' },
      ],
      correctOptionIds: [`${id}-a`],
    },
  });
  return (
    <section aria-label={id}>
      <QuestionSetResponseEditor answer={answer} onChange={setAnswer} />
    </section>
  );
}
it('keeps correct-answer selections independent across multiple questions', () => {
  render(
    <>
      <Answer id="first" />
      <Answer id="second" />
    </>,
  );
  expect(
    (
      within(screen.getByRole('region', { name: 'first' })).getByLabelText(
        'Option 1 is correct',
      ) as HTMLInputElement
    ).name,
  ).not.toBe(
    (
      within(screen.getByRole('region', { name: 'second' })).getByLabelText(
        'Option 1 is correct',
      ) as HTMLInputElement
    ).name,
  );
  fireEvent.click(
    within(screen.getByRole('region', { name: 'second' })).getByLabelText('Option 2 is correct'),
  );
  expect(
    within(screen.getByRole('region', { name: 'first' })).getByLabelText('Option 1 is correct'),
  ).toBeChecked();
  expect(
    within(screen.getByRole('region', { name: 'second' })).getByLabelText('Option 2 is correct'),
  ).toBeChecked();
});

it('uses keyboard mode choices and clears correct answers when changing selection mode', () => {
  render(<Answer id="modes" />);
  const selection = screen.getByRole('radiogroup', { name: 'Selection' });
  fireEvent.keyDown(within(selection).getByRole('radio', { name: 'Choose one' }), { key: 'End' });
  expect(within(selection).getByRole('radio', { name: 'Choose several' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Option 1 is correct' })).not.toBeChecked();
  fireEvent.keyDown(screen.getByRole('radio', { name: 'Multiple choice' }), { key: 'Home' });
  expect(screen.getByRole('button', { name: 'Change format' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Change format' }));
  expect(screen.getByRole('radio', { name: 'Written answer' })).toBeChecked();
  expect(screen.queryByLabelText('Option 1 is correct')).not.toBeInTheDocument();
});
