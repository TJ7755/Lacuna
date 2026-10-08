import { fireEvent, render, screen } from '@testing-library/react';
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

it('lets paper editing show one pane and hide the general image uploader', () => {
  render(
    <MarkdownEditor
      ariaLabel="Paper question"
      value="A cell"
      onChange={vi.fn()}
      allowImages={false}
      layout="tabs"
      compactToolbar
    />,
  );
  expect(screen.queryByTitle('Insert image')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Heading')).not.toBeInTheDocument();
  expect(screen.getByTitle('More formatting')).toBeInTheDocument();
});

describe('MarkdownEditor toolbar for non-specialists', () => {
  it('names formatting controls in words and offers maths without dollar syntax', () => {
    render(<MarkdownEditor ariaLabel="Question text" value="" onChange={vi.fn()} compactToolbar />);
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inline maths' })).toHaveTextContent('Maths');
  });

  it('applies bold and italic from the keyboard', () => {
    const onChange = vi.fn();
    render(<MarkdownEditor ariaLabel="Question text" value="" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Question text' });
    fireEvent.keyDown(input, { key: 'b', ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith('**bold text**');
    fireEvent.keyDown(input, { key: 'i', metaKey: true });
    expect(onChange).toHaveBeenLastCalledWith('_italic text_');
  });
});

describe('MarkdownEditor maths preview', () => {
  it('shows how maths reads beneath the Write tab once the text contains it', () => {
    const { container, rerender } = render(
      <MarkdownEditor
        ariaLabel="Question text"
        value="Solve it"
        onChange={vi.fn()}
        layout="tabs"
      />,
    );
    expect(container.querySelector('[data-maths-preview]')).toBeNull();
    expect(screen.getByRole('button', { name: 'write' })).toHaveAttribute('aria-pressed', 'true');
    rerender(
      <MarkdownEditor
        ariaLabel="Question text"
        value="Solve $3x = 9$"
        onChange={vi.fn()}
        layout="tabs"
      />,
    );
    expect(container.querySelector('[data-maths-preview]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    expect(container.querySelector('[data-maths-preview]')).toBeNull();
  });
});
