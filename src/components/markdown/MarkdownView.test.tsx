import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

vi.mock('../../db/assets', () => ({
  ASSET_PROTOCOL: 'lacuna-asset://',
}));

vi.mock('../../db/assetCache', () => ({
  resolveAssetMarkdownCached: vi.fn((md: string) => Promise.resolve(md)),
}));

describe('MarkdownView — embed rendering (allowEmbeds true)', () => {
  it('converts a bare YouTube watch URL to a youtube-nocookie iframe', () => {
    const { container } = render(
      <MarkdownView source="https://www.youtube.com/watch?v=dQw4w9WgXcQ" allowEmbeds />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    // The responsive wrapper's layout classes must survive sanitisation, else the
    // aspect-ratio box collapses and the video renders at zero height.
    expect(container.querySelector('.aspect-video iframe')).not.toBeNull();
  });

  it('converts a youtu.be short URL to a youtube-nocookie iframe', () => {
    const { container } = render(
      <MarkdownView source="https://youtu.be/abc123defGH" allowEmbeds />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123defGH',
    );
  });

  it('converts a bare Vimeo URL to a player.vimeo iframe', () => {
    const { container } = render(
      <MarkdownView source="https://vimeo.com/123456789" allowEmbeds />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute('src')).toBe('https://player.vimeo.com/video/123456789');
  });

  it('does NOT create an iframe when allowEmbeds is false (default)', () => {
    const { container } = render(
      <MarkdownView source="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('SECURITY: strips an iframe whose src points to a disallowed host', () => {
    const { container } = render(
      <MarkdownView
        source='<iframe src="https://evil.example/steal-cookies"></iframe>'
        allowEmbeds
      />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('SECURITY: strips an iframe with a javascript: src', () => {
    const { container } = render(
      <MarkdownView
        source='<iframe src="javascript:alert(document.cookie)"></iframe>'
        allowEmbeds
      />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders a <details><summary> collapsible block', () => {
    const { container } = render(
      <MarkdownView
        source="<details><summary>Section title</summary>\n\nBody text.\n\n</details>"
        allowEmbeds
      />,
    );
    expect(container.querySelector('details')).not.toBeNull();
    expect(container.querySelector('summary')).not.toBeNull();
    expect(container.querySelector('summary')!.textContent).toBe('Section title');
  });
});
