import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LessonNoteEditor } from './LessonNoteEditor';

it('associates note title label with its input', () => {
  render(<LessonNoteEditor onSave={vi.fn()} onCancel={vi.fn()} />);

  expect(screen.getByLabelText('Title')).toBeInTheDocument();
});
