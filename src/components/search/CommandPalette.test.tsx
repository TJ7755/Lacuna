import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

const dataHooks = vi.hoisted(() => ({
  useDecks: vi.fn(() => []),
  useAllCards: vi.fn(() => []),
  useCourses: vi.fn(() => []),
  useAllLessons: vi.fn(() => []),
  useAllNotes: vi.fn(() => []),
}));

vi.mock('../../state/useData', () => ({
  useDecks: dataHooks.useDecks,
  useAllCards: dataHooks.useAllCards,
}));
vi.mock('../../state/useCourseData', () => ({
  useCourses: dataHooks.useCourses,
  useAllLessons: dataHooks.useAllLessons,
  useAllNotes: dataHooks.useAllNotes,
}));

describe('CommandPalette', () => {
  it('does not subscribe to whole-database queries while closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} />, { wrapper: MemoryRouter });
    Object.values(dataHooks).forEach((hook) => expect(hook).not.toHaveBeenCalled());
  });

  it('exposes an open palette as a focus-trapped modal', async () => {
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.style.opacity).toBe('');
    expect(screen.getByPlaceholderText(/search courses/i)).toHaveFocus();
    Object.values(dataHooks).forEach((hook) => expect(hook).toHaveBeenCalled());
  });

  it('updates search results without a fixed debounce delay', () => {
    render(<CommandPalette open onClose={vi.fn()} />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText(/search courses/i), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('Nothing matches “missing”.')).toBeInTheDocument();
  });
});
