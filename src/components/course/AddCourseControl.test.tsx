import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddCourseControl } from './AddCourseControl';

describe('AddCourseControl', () => {
  it('opens its choices with arrow keys and returns focus on Escape', () => {
    render(<AddCourseControl onAdd={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Add' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Lesson');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Practice');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
  it('offers Practice Qs and reports its kind', () => {
    const onAdd = vi.fn();
    render(<AddCourseControl onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Practice Qs' }));
    expect(onAdd).toHaveBeenCalledWith('question-set');
  });

  it('shows only the requested kinds', () => {
    render(<AddCourseControl onAdd={vi.fn()} kinds={['lesson', 'checkpoint']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const group = screen.getByRole('menu', { name: 'Add' });
    expect(
      within(group)
        .getAllByRole('menuitem')
        .map((button) => button.textContent),
    ).toEqual(['Lesson', 'Checkpoint']);
  });
});
