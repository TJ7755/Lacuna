import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StudyTargetTiles } from './CourseStudyTarget';

it('offers both study targets as radios and marks only the chosen one', () => {
  const onChange = vi.fn();
  render(<StudyTargetTiles name="target" value="steady" onChange={onChange} />);
  const exam = screen.getByRole('radio', { name: /Exam date/ });
  const steady = screen.getByRole('radio', { name: /Steady retention/ });
  expect(steady).toBeChecked();
  expect(steady.closest('label')).toHaveClass('bg-accent-soft');
  expect(exam.closest('label')).not.toHaveClass('bg-accent-soft');
  fireEvent.click(exam);
  expect(onChange).toHaveBeenCalledWith('exam');
});

it('leaves both unchosen until the learner picks one', () => {
  render(<StudyTargetTiles name="target" value={null} onChange={vi.fn()} />);
  expect(
    screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked),
  ).toHaveLength(0);
});
