import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathsAnswerInput } from './MathsAnswerInput';

function Harness({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <MathsAnswerInput value={value} onChange={setValue} />;
}

describe('MathsAnswerInput', () => {
  it('updates the KaTeX preview through the shared expression parser', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), {
      target: { value: '3/4' },
    });

    await waitFor(() => expect(document.querySelector('.katex')).not.toBeNull());
    expect(screen.queryByText('Fix the expression to preview it.')).not.toBeInTheDocument();
  });

  it('shows a local parse error without crashing the preview', () => {
    render(<Harness initialValue="2 +" />);
    const input = screen.getByRole('textbox', { name: 'Answer' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Fix the expression to preview it.')).toBeInTheDocument();
    expect(screen.getByText(/Unexpected end of expression|Unexpected end/)).toBeInTheDocument();
  });

  it('inserts palette templates at the current cursor position', async () => {
    render(<Harness initialValue="x" />);
    const input = screen.getByRole('textbox', { name: 'Answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(1, 1);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Insert power' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert power' }));

    expect(input).toHaveValue('x^()');
    await waitFor(() => expect(input.selectionStart).toBe(3));
  });

  it('wraps selected text as the numerator of a fraction', () => {
    render(<Harness initialValue="12 + 3" />);
    const input = screen.getByRole('textbox', { name: 'Answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(0, 2);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Insert fraction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Insert fraction' }));

    expect(input).toHaveValue('(12)/() + 3');
  });
});
