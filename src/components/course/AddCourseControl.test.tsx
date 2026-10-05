import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddCourseControl } from './AddCourseControl';

describe('AddCourseControl', () => {
  it('offers Practice Qs and reports its kind', () => {
    const onAdd = vi.fn();
    render(<AddCourseControl onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice Qs' }));
    expect(onAdd).toHaveBeenCalledWith('question-set');
  });

  it('shows only the requested kinds', () => {
    render(<AddCourseControl onAdd={vi.fn()} kinds={['lesson', 'checkpoint']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const group = screen.getByRole('group', { name: 'Add to course' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Lesson',
      'Checkpoint',
    ]);
  });
});
