import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BatchCandidate } from '../../items/batchStaging';
import { StagedItemEditor } from './StagedItemEditor';

function candidate(overrides: Partial<BatchCandidate> = {}): BatchCandidate {
  return {
    id: 'candidate-1',
    index: 0,
    raw: null,
    sourceJson: '{}',
    kind: 'numeric',
    question: 'Fallback question',
    explanation: 'Fallback explanation',
    targetConcept: 'Fallback concept',
    prerequisiteConcepts: ['Fallback prerequisite'],
    errors: [],
    fixtureStatus: null,
    ...overrides,
  };
}

function renderEditor(value: BatchCandidate) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(<StagedItemEditor candidate={value} onApply={onApply} onCancel={onCancel} />);
  const applied = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply edit' }));
    return JSON.parse(onApply.mock.lastCall![0] as string) as Record<string, unknown>;
  };
  return { onApply, onCancel, applied };
}

const field = (name: string) => screen.getByRole('textbox', { name });

describe('StagedItemEditor', () => {
  it('falls back to parsed candidate fields when the raw item is not an object', () => {
    const { applied } = renderEditor(candidate({ raw: ['not', 'a', 'record'] }));
    expect(applied()).toEqual({
      kind: 'numeric',
      question: 'Fallback question',
      explanation: 'Fallback explanation',
      targetConcept: 'Fallback concept',
      prerequisiteConcepts: ['Fallback prerequisite'],
      answer: { kind: 'exact', value: '' },
    });
  });

  it('applies edited numeric fields, trimming blank Concept lines and keeping the answer', () => {
    const { applied } = renderEditor(
      candidate({
        raw: {
          question: 'Raw question',
          prerequisiteConcepts: ['Ratio', 7],
          answer: { kind: 'within', value: '3.14', tolerance: 0.5 },
        },
      }),
    );
    expect(field('Question')).toHaveValue('Raw question');
    expect(field('Prerequisite Concepts')).toHaveValue('Ratio');

    fireEvent.change(field('Question'), { target: { value: 'Edited question' } });
    fireEvent.change(field('Worked explanation'), { target: { value: 'Edited explanation' } });
    fireEvent.change(field('Primary target Concept'), { target: { value: 'Area' } });
    fireEvent.change(field('Prerequisite Concepts'), {
      target: { value: '  Ratio \n\n Pi  \n' },
    });

    expect(applied()).toEqual({
      kind: 'numeric',
      question: 'Edited question',
      explanation: 'Edited explanation',
      targetConcept: 'Area',
      prerequisiteConcepts: ['Ratio', 'Pi'],
      answer: { kind: 'within', value: '3.14', tolerance: 0.5 },
    });
  });

  it('reads one-of answers and drops non-string values', () => {
    const { applied } = renderEditor(
      candidate({ raw: { answer: { kind: 'matches-one-of', values: ['1/2', 0.5, '0.5'] } } }),
    );
    expect(applied().answer).toEqual({ kind: 'matches-one-of', values: ['1/2', '0.5'] });
  });

  it('edits working fixtures field by field', () => {
    const { applied } = renderEditor(
      candidate({
        kind: 'working',
        raw: {
          scheme: 'M1 for x = 2',
          fixtures: [
            { id: 'f-1', studentAnswer: ['x + 1 = 3', 'x = 2'], expectedMarks: 1, note: 'Full' },
            { studentAnswer: 'x = 5', expectedMarks: 'one' },
          ],
        },
      }),
    );
    expect(field('Sample answer 1')).toHaveValue('x + 1 = 3\nx = 2');
    expect(field('Sample answer 2')).toHaveValue('x = 5');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.change(field('Sample answer 1'), { target: { value: ' x = 2 \n\n' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Fixture 1 note' }), {
      target: { value: '   ' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Expected marks' }), {
      target: { value: '2' },
    });

    const edited = applied();
    expect(edited.scheme).toBe('M1 for x = 2');
    expect(edited.fixtures).toEqual([{ id: 'f-1', studentAnswer: ['x = 2'], expectedMarks: 2 }]);
  });

  it('switches kind, adds a fixture from empty and cancels without applying', () => {
    const { onApply, onCancel, applied } = renderEditor(candidate({ kind: null }));
    fireEvent.click(screen.getByRole('button', { name: 'working' }));
    expect(screen.getByRole('button', { name: 'working' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Add at least one sample answer/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add fixture' }));
    fireEvent.change(field('Sample answer 1'), { target: { value: 'x = 2' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Fixture 1 note' }), {
      target: { value: ' Partial ' },
    });
    const fixtures = applied().fixtures as Record<string, unknown>[];
    expect(fixtures).toEqual([
      expect.objectContaining({ studentAnswer: ['x = 2'], expectedMarks: 0, note: 'Partial' }),
    ]);
    expect(fixtures[0].id).toMatch(/^fixture-1-/);

    onApply.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
