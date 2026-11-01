import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownView } from './MarkdownView';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg><text>Rendered diagram</text></svg>' })),
  },
}));
vi.mock('dompurify', () => ({ default: { sanitize: (svg: string) => svg } }));

describe('Markdown diagram source', () => {
  it('discloses source through a labelled control and retains it across theme updates', async () => {
    const source = 'flowchart TD\n  A-->B';
    const { container, rerender } = render(
      <StrictMode>
        <MarkdownView source={`\`\`\`mermaid\n${source}\n\`\`\``} />
      </StrictMode>,
    );
    const trigger = await screen.findByRole('button', { name: 'Diagram source' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const code = container.querySelector('.lacuna-mermaid-source code')!;
    expect(code.textContent).toBe(source);
    expect(code.closest('[inert]')).not.toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(code.closest('[inert]')).toBeNull();
    const svg = container.querySelector('svg');
    document.documentElement.classList.toggle('dark');
    await waitFor(() => expect(container.querySelector('svg')).not.toBe(svg));
    expect(screen.getByRole('button', { name: 'Diagram source' })).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    document.documentElement.classList.toggle('dark');
    rerender(<MarkdownView source="Replacement content" />);
    expect(screen.queryByRole('button', { name: 'Diagram source' })).not.toBeInTheDocument();
    expect(container.querySelector('.lacuna-mermaid-source')).toBeNull();
  });
});
