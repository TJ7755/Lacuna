import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { SectionCard } from './SectionCard';

describe('SectionCard', () => {
  it('renders a bordered surface section with the standard padding', () => {
    render(
      <SectionCard aria-label="Appearance" className="mb-8">
        Content
      </SectionCard>,
    );
    const card = screen.getByRole('region', { name: 'Appearance' });
    expect(card.tagName).toBe('SECTION');
    expect(card).toHaveClass('rounded-2xl', 'border', 'border-line', 'bg-surface', 'p-6', 'mb-8');
    expect(card).toHaveTextContent('Content');
  });

  it('supports a compact div and forwards its ref', () => {
    const ref = createRef<HTMLElement>();
    render(
      <SectionCard as="div" compact ref={ref} data-testid="card">
        Chart
      </SectionCard>,
    );
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('DIV');
    expect(card).toHaveClass('p-5');
    expect(card).not.toHaveClass('p-6');
    expect(ref.current).toBe(card);
  });
});
