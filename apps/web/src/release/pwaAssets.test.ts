import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

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

describe('brand mark palette', () => {
  async function landingLime(): Promise<string> {
    const css = await readFile(resolve(projectRoot, 'apps/web/src/pages/Landing.css'), 'utf8');
    const colour = css.match(/--amber:\s*(#[0-9a-f]{6})/i)?.[1];
    if (!colour) throw new Error('Missing landing mark colour');
    return colour;
  }

  it('uses the landing lime in the standalone SVG mark', async () => {
    const source = await readFile(assetPath('/icon.svg'), 'utf8');
    expect(source).toContain(await landingLime());
    expect(source).not.toContain('#e8a43d');
  });

  it.each([
    'public/icons/favicon-48.png',
    'public/icons/favicon-96.png',
    'public/icons/apple-touch-icon-180.png',
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-512.png',
    'public/favicon.ico',
    'apps/desktop/assets/icon.png',
    'apps/desktop/assets/portable-splash.bmp',
  ])('ships the same lime mark in %s', async (filename) => {
    const colour = await landingLime();
    const rgb = [1, 3, 5].map((offset) => parseInt(colour.slice(offset, offset + 2), 16));
    const input = await readFile(resolve(projectRoot, filename));
    let pixels: Buffer;
    let channels: number;
    if (filename.endsWith('.bmp')) {
      pixels = input.subarray(input.readUInt32LE(10));
      rgb.reverse();
      channels = 3;
    } else {
      const decoded = await sharp(filename.endsWith('.ico') ? input.subarray(22) : input)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      pixels = decoded.data;
      channels = decoded.info.channels;
    }
    let matches = 0;
    for (let i = 0; i < pixels.length; i += channels) {
      if (rgb.every((value, channel) => pixels[i + channel] === value)) matches++;
    }
    expect(matches).toBeGreaterThan(20);
  });
});
