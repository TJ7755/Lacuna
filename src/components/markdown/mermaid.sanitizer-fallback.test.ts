import { expect, it, vi } from 'vitest';
import { sanitizeDiagramSvg } from './mermaid';

vi.mock('mermaid', () => ({ default: {} }));
vi.mock('dompurify', () => ({
  default: () => {
    throw new Error('Sanitiser binding failed');
  },
}));

it('returns an empty SVG when the sanitiser factory cannot bind to the browser', async () => {
  await expect(sanitizeDiagramSvg('<svg><text>Diagram</text></svg>')).resolves.toBe('');
});
