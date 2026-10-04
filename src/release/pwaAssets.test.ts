import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ManifestIcon = {
  src: string;
  purpose?: string;
};

type Manifest = {
  icons: ManifestIcon[];
};

const projectRoot = process.cwd();

function assetPath(src: string): string {
  return resolve(projectRoot, 'public', src.replace(/^\/+/, ''));
}

describe('PWA assets', () => {
  it('references existing manifest icons', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, 'public/manifest.json'), 'utf8'),
    ) as Manifest;

    for (const icon of manifest.icons) {
      expect(existsSync(assetPath(icon.src))).toBe(true);
    }
  });

  it('references an existing PNG Apple touch icon', async () => {
    const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
    const match = html.match(/<link\s+rel="apple-touch-icon"\s+href="([^"]+)"[^>]*>/);

    expect(match).not.toBeNull();
    const href = match?.[1] ?? '';
    expect(href.endsWith('.png')).toBe(true);
    expect(existsSync(assetPath(href))).toBe(true);
  });

  it('asks the viewport to cover the unsafe area so the translucent status bar can paint', async () => {
    const html = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('declares exactly one maskable manifest icon', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, 'public/manifest.json'), 'utf8'),
    ) as Manifest;

    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(1);
  });

  it.each(['index.html', 'compare/quizlet/index.html'])(
    'links crawlable favicons sized for Google Search from %s',
    async (page) => {
      const html = await readFile(resolve(projectRoot, page), 'utf8');
      const icons = [...html.matchAll(/<link\s+rel="icon"\s+[^>]*href="([^"]+)"[^>]*>/g)].map(
        (match) => match[1] ?? '',
      );

      expect(icons).toContain('/favicon.ico');
      expect(icons.some((href) => /\.png$/.test(href))).toBe(true);
      for (const href of icons) {
        expect(existsSync(assetPath(href))).toBe(true);
      }
    },
  );

  it('does not block favicon files in robots.txt', async () => {
    const robots = await readFile(resolve(projectRoot, 'public/robots.txt'), 'utf8');
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/(favicon|icon)/im);
  });
});
