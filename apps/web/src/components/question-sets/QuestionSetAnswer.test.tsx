import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { QuestionResponse, QuestionSet } from '../../questions/questionSets';
import { QuestionSetAnswer } from './QuestionSetAnswer';

function ControlledAnswer({
  content,
  initialValue,
  onChange,
}: {
  content: QuestionSet;
  initialValue: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <QuestionSetAnswer
      content={content}
      nodeId="subpart-i"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function questionSet(response: QuestionResponse): QuestionSet {
  return {
    id: 'set-1',
    courseId: 'course-1',
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'question-1',
        prompt: 'Shared context: ![Cell diagram](https://example.com/cell.png)',
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
              {
                id: 'subpart-ii',
                prompt: 'Explain its function.',
                answer: {
                  maxMarks: 1,
                  response: { kind: 'written' },
                  prerequisiteConceptIds: [],
                  allocations: [
                    {
                      id: 'allocation-2',
                      criterion: 'Explains the function.',
                      maxMarks: 1,
                      dimension: 'application',
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

describe('QuestionSetAnswer', () => {
  it('renders ancestor context and diagram without sibling prompts or mark scheme content', () => {
    render(
      <QuestionSetAnswer
        content={questionSet({ kind: 'written' })}
        nodeId="subpart-i"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Shared context:')).toBeInTheDocument();
    expect(screen.getByAltText('Cell diagram')).toBeInTheDocument();
    expect(screen.getByText('Use the context above.')).toBeInTheDocument();
    expect(screen.getByText('Name the organelle.')).toBeInTheDocument();
    expect(screen.getByText('2 marks')).toBeInTheDocument();
    expect(screen.queryByText('Explain its function.')).not.toBeInTheDocument();
    expect(screen.queryByText('Names the organelle.')).not.toBeInTheDocument();
  });

  it('emits controlled written answer changes', () => {
    const onChange = vi.fn();
    render(
      <QuestionSetAnswer
        content={questionSet({ kind: 'written' })}
        nodeId="subpart-i"
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nucleus' } });
    expect(onChange).toHaveBeenCalledWith('Nucleus');
  });

  it.each([
    ['single', ['option-b'], ['option-a'], ['option-a']],
    ['multiple', [], ['option-c', 'option-a'], ['option-c', 'option-a']],
  ] as const)('preserves %s-choice option IDs', (selection, value, clicks, expected) => {
    const onChange = vi.fn();
    const content = questionSet({
      kind: 'multiple-choice',
      selection,
      options: [
        { id: 'option-a', content: 'Nucleus' },
        { id: 'option-b', content: 'Mitochondrion' },
        { id: 'option-c', content: 'Ribosome' },
      ],
      correctOptionIds: ['option-a'],
    });
    render(<ControlledAnswer content={content} initialValue={[...value]} onChange={onChange} />);

    const labels: Record<string, string> = {
      'option-a': 'Nucleus',
      'option-b': 'Mitochondrion',
      'option-c': 'Ribosome',
    };
    for (const id of clicks) fireEvent.click(screen.getByLabelText(new RegExp(labels[id])));
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it('blocks edits in read-only mode', () => {
    const onChange = vi.fn();
    render(
      <QuestionSetAnswer
        content={questionSet({ kind: 'written' })}
        nodeId="subpart-i"
        value="Existing answer"
        onChange={onChange}
        readOnly
      />,
    );

    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveAttribute('readOnly');
    fireEvent.change(textbox, { target: { value: 'Changed' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
