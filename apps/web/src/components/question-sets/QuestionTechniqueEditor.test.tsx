import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { TechniqueTags } from '@lacuna/core/questions/techniqueTags';
import { QuestionTechniqueEditor } from './QuestionTechniqueEditor';

it('preserves legacy taxonomy and Jev provenance until an explicit author correction', () => {
  const initial: TechniqueTags = {
    taxonomyId: 'science-explanations',
    taxonomyVersion: 1,
    techniqueIds: ['causal-link'],
    provenance: { source: 'jev', model: 'classification-model' },
  };
  const onChange = vi.fn();
  const { rerender } = render(<QuestionTechniqueEditor tags={initial} onChange={onChange} />);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByText(/Classified by Jev \(classification-model\)/)).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenLastCalledWith({
    ...initial,
    techniqueIds: [],
    provenance: { source: 'author' },
  });
  rerender(<QuestionTechniqueEditor tags={initial} onChange={onChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'science-techniques' } });
  expect(onChange).toHaveBeenLastCalledWith({
    ...initial,
    taxonomyId: 'science-techniques',
    provenance: { source: 'author' },
  });
  expect(initial.provenance.source).toBe('jev');
});
