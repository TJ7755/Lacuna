import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

describe('MarkdownEditor accessible name', () => {
  it('uses its visible label when no explicit accessible name is supplied', () => {
    render(<MarkdownEditor label="Front" value="" onChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Front' })).toBeInTheDocument();
  });

  it('prefers an explicit accessible name over the visible label', () => {
    render(<MarkdownEditor label="Text" ariaLabel="Cloze prompt" value="" onChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Cloze prompt' })).toBeInTheDocument();
  });
});
