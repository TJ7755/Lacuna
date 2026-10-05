import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field, Input } from './Field';

describe('Field', () => {
  it('labels its input and shows the hint', () => {
    render(
      <Field label="Course name" hint="Shown on the dashboard.">
        <Input value="" onChange={() => undefined} />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /Course name/ });
    expect(input).toHaveClass('w-full', 'border-line-strong', 'bg-surface');
    expect(input).toHaveAttribute('id');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Shown on the dashboard.')).toHaveClass('text-ink-faint');
  });

  it('marks the input invalid and describes it with the error', () => {
    render(
      <Field label="Daily goal" error="Enter a whole number.">
        <Input value="x" onChange={() => undefined} />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: /Daily goal/ });
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Enter a whole number.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('associates a non-Input control through the wrapping label', () => {
    render(
      <Field label="Notes">
        <textarea />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA');
  });

  it('keeps an explicit id and extra classes on the input', () => {
    render(<Input id="custom" className="font-mono" aria-label="Code" />);
    const input = screen.getByRole('textbox', { name: 'Code' });
    expect(input).toHaveAttribute('id', 'custom');
    expect(input).toHaveClass('font-mono', 'rounded-lg');
  });
});
