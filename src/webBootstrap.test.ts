import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { installSimpleAnalytics, installHostedFontLinks, registerProductionServiceWorker } from './webBootstrap';

describe('hosted web bootstrap', () => {
  it('does not request hosted fonts from a packaged app origin', () => {
    const { document, links } = fakeDocument();

    installHostedFontLinks(document, 'app:');

    expect(links).toHaveLength(0);
  });

  it('loads the hosted font stylesheet for HTTP pages', () => {
    const { document, links } = fakeDocument();

    installHostedFontLinks(document, 'https:');

    expect(links).toContainEqual(
      expect.objectContaining({
        rel: 'stylesheet',
        href: expect.stringContaining('https://fonts.googleapis.com/css2'),
      }),
    );
    const stylesheet = links.find((link) => link.rel === 'stylesheet')!;
    expect(new URL(stylesheet.href).searchParams.getAll('family')).toEqual([
      'Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700',
      'JetBrains Mono:wght@400;500;600',
    ]);
  });

  it('does not attempt service-worker registration from a packaged app origin', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerProductionServiceWorker({
      isProduction: true,
      protocol: 'app:',
      register,
    });

    expect(register).not.toHaveBeenCalled();
  });

  it('registers the generated worker for a production HTTP page', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerProductionServiceWorker({
      isProduction: true,
      protocol: 'https:',
      register,
    });

    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});

function fakeDocument(): { document: Document; links: HTMLLinkElement[] } {
  const links: HTMLLinkElement[] = [];
  const document = {
    createElement: () => ({}) as HTMLLinkElement,
    head: {
      append: (...elements: HTMLLinkElement[]) => {
        links.push(...elements);
      },
    },
  } as unknown as Document;
  return { document, links };
}


describe('Simple Analytics bootstrap', () => {
  it('loads the asynchronous script once on the production website', () => {
    const targetDocument = document.implementation.createHTMLDocument();
    const options = { targetDocument, isProduction: true, origin: 'https://getlacuna.app' };
    installSimpleAnalytics(options);
    installSimpleAnalytics(options);
    const scripts = targetDocument.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://scripts.simpleanalyticscdn.com/latest.js');
    expect(scripts[0].async).toBe(true);
    expect(scripts[0].crossOrigin).toBe('anonymous');
    expect(scripts[0].hasAttribute('data-collect-dnt')).toBe(false);
  });

  it.each([
    [false, 'https://getlacuna.app'],
    [true, 'http://localhost:5173'],
    [true, 'https://preview.vercel.app'],
    [true, 'app://lacuna'],
    [true, 'file://'],
  ])('does not load analytics with production=%s on %s', (isProduction, origin) => {
    const targetDocument = document.implementation.createHTMLDocument();
    installSimpleAnalytics({ targetDocument, isProduction, origin });
    expect(targetDocument.querySelector('script')).toBeNull();
  });

  it('allows the script and collection endpoint through the web CSP', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/script-src[^;]*https:\/\/scripts.simpleanalyticscdn.com/);
    expect(html).toMatch(/connect-src[^;]*https:\/\/queue.simpleanalyticscdn.com/);
    expect(html).toMatch(/img-src[^;]*https:\/\/queue.simpleanalyticscdn.com/);
  });
});
