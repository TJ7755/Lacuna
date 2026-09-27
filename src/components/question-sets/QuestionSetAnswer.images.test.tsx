import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionResponse, QuestionSet } from '../../questions/questionSets';
import { QuestionSetAnswer } from './QuestionSetAnswer';

function content(response: QuestionResponse): QuestionSet {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question-1',
        prompt: 'Shared context: ![Cell diagram](https://example.com/diagram.png)',
        parts: [
          {
            id: 'part-a',
            prompt: 'Use the context above.',
            subparts: [
              {
                id: 'subpart-i',
                prompt: 'Name the organelle.',
                answer: {
                  maxMarks: 2,
                  response,
                  prerequisiteConceptIds: [],
                  allocations: [
                    {
                      id: 'allocation-1',
                      criterion: 'Names the organelle.',
                      maxMarks: 2,
                      dimension: 'knowledge',
                      targetConceptIds: [],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function ControlledAnswer({
  questionSet,
  initialValue = '',
}: {
  questionSet: QuestionSet;
  initialValue?: string | string[];
}) {
  const [value, setValue] = useState<string | string[]>(initialValue);
  return (
    <QuestionSetAnswer
      content={questionSet}
      nodeId="subpart-i"
      value={value}
      onChange={setValue}
    />
  );
}

describe('QuestionSetAnswer image enlargement', () => {
  it('keeps a typed response when the learner enlarges a shared diagram and closes it with Escape', () => {
    render(<ControlledAnswer questionSet={content({ kind: 'written' })} />);

    const answer = screen.getByRole('textbox');
    fireEvent.change(answer, { target: { value: 'Mitochondrion' } });
    const enlarge = screen.getByRole('button', { name: 'Enlarge image: Cell diagram' });
    enlarge.focus();
    fireEvent.click(enlarge);

    expect(screen.getByRole('dialog', { name: 'Image' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Image' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/diagram.png',
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Image' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Image' })).not.toBeInTheDocument();
    expect(answer).toHaveValue('Mitochondrion');
    expect(enlarge).toHaveFocus();
  });

  it('enlarges an image inside a multiple-choice option and closes it with the close button', () => {
    const set = content({
      kind: 'multiple-choice',
      selection: 'single',
      options: [
        { id: 'option-a', content: '![Option diagram](https://example.com/diagram.png)' },
        { id: 'option-b', content: 'Nucleus' },
      ],
      correctOptionIds: ['option-a'],
    });
    render(<ControlledAnswer questionSet={set} initialValue={['option-b']} />);

    const selected = screen.getByRole('radio', { name: /Nucleus/ });
    expect(selected).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: Option diagram' }));
    expect(selected).toBeChecked();
    expect(screen.getByRole('dialog', { name: 'Image' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close image' }));

    expect(screen.queryByRole('dialog', { name: 'Image' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Nucleus/ })).toBeChecked();
  });

  it('keeps diagram enlargement available in read-only multiple-choice review', () => {
    const set = content({
      kind: 'multiple-choice',
      selection: 'single',
      options: [
        { id: 'option-a', content: '![Option diagram](https://example.com/diagram.png)' },
        { id: 'option-b', content: 'Nucleus' },
      ],
      correctOptionIds: ['option-a'],
    });
    render(
      <QuestionSetAnswer
        content={set}
        nodeId="subpart-i"
        value={['option-b']}
        onChange={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByRole('radio', { name: /Option diagram/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: Option diagram' }));
    expect(screen.getByRole('dialog', { name: 'Image' })).toBeInTheDocument();
  });
});
