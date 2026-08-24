import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MathsAnswerInput } from './MathsAnswerInput';

function Harness({ initialValue = '', label }: { initialValue?: string; label?: string }) {
  const [value, setValue] = useState(initialValue);
  return <MathsAnswerInput value={value} onChange={setValue} label={label} />;
}

describe('MathsAnswerInput', () => {
  it('activates the rendered answer only after Space follows valid notation', async () => {
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Answer' });

    fireEvent.change(input, {
      target: { value: '3/4' },
    });
    expect(document.querySelector('.katex')).toBeNull();

    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.change(input, { target: { value: '3/4 ' } });

    await waitFor(() => expect(document.querySelector('.katex')).not.toBeNull());
  });

  it('shows a local parse error without rendering invalid notation', () => {
    render(<Harness initialValue="2 +" />);
    const input = screen.getByRole('textbox', { name: 'Answer' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/Unexpected end of expression|Unexpected end/)).toBeInTheDocument();
  });

  it('does not arm the rendered answer when Space follows invalid notation', () => {
    render(<Harness initialValue="2 +" />);
    const input = screen.getByRole('textbox', { name: 'Answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.change(input, { target: { value: '2 + ' } });
    fireEvent.change(input, { target: { value: '2 + 2 ' } });

    expect(document.querySelector('.katex')).toBeNull();
  });

  it('resets rendered-answer activation when the input is cleared', async () => {
    render(<Harness initialValue="4" />);
    const input = screen.getByRole('textbox', { name: 'Answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.change(input, { target: { value: '4 ' } });
    await waitFor(() => expect(document.querySelector('.katex')).not.toBeNull());

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '5' } });

    expect(document.querySelector('.katex')).toBeNull();
  });

  it('keeps the rendered answer current during continued editing', async () => {
    render(<Harness initialValue="3/4" />);
    const input = screen.getByRole('textbox', { name: 'Answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.change(input, { target: { value: '3/4 ' } });
    expect(await screen.findByRole('status', { name: 'Rendered answer: 3/4' })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '5/6' } });

    expect(screen.getByRole('status', { name: 'Rendered answer: 5/6' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Rendered answer: 3/4' })).not.toBeInTheDocument();
  });

  it('keeps editable notation and rendered output in one full-width control', async () => {
    render(<Harness initialValue="x^2" label="Corrected answer" />);
    const input = screen.getByRole('textbox', { name: 'Corrected answer' }) as HTMLInputElement;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    fireEvent.change(input, { target: { value: 'x^2 ' } });

    const control = input.parentElement;
    expect(control).not.toBeNull();
    if (!control) throw new Error('Maths answer control not found.');
    expect(control).toHaveClass('w-full');
    expect(within(control).getByRole('textbox', { name: 'Corrected answer' })).toBe(input);
    expect(
      await within(control).findByRole('status', { name: 'Rendered answer: x^2' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
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
