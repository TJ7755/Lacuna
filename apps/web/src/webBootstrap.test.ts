import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { installSimpleAnalytics, registerProductionServiceWorker } from './webBootstrap';

describe('hosted web bootstrap', () => {
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
    [true, 'https://gaps.getlacuna.app'],
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

it.each([
  { name: 'first visit', hash: '', app: false },
  { name: 'landing anchor', hash: '#how-it-works', app: false },
  { name: 'app route', hash: '#/cards', app: true },
  { name: 'returning browser', hash: '', seeded: '1', app: true },
  { name: 'empty seed flag', hash: '', seeded: '', app: true },
  { name: 'storage denied', hash: '', denied: true, app: false },
  { name: 'storage-denied app route', hash: '#/', denied: true, app: true },
])('selects the homepage entry before modules load: $name', ({ hash, app, ...options }) => {
  const targetDocument = document.implementation.createHTMLDocument();
  const sourceDocument = new DOMParser().parseFromString(
    readFileSync('index.html', 'utf8'),
    'text/html',
  );
  runInNewContext(sourceDocument.querySelector('script:not([type]):not([src])')!.textContent, {
    document: targetDocument,
    window: {
      location: { hash, hostname: 'getlacuna.app', protocol: 'https:' },
      matchMedia: () => ({ matches: true }),
    },
    localStorage: {
      getItem: (key: string) => {
        if ('denied' in options) throw new Error('Storage denied');
        return key === 'lacuna-seeded' && 'seeded' in options ? options.seeded : null;
      },
    },
  });
  expect(targetDocument.documentElement.hasAttribute('data-app-starting')).toBe(app);
});

it.each(['', '#how-it-works', '#/teach', '#/share', '#/s/abc'])(
  'starts Gaps before the landing page can paint, preserving app routes (%s)',
  (hash) => {
    const targetDocument = document.implementation.createHTMLDocument();
    const sourceDocument = new DOMParser().parseFromString(
      readFileSync('index.html', 'utf8'),
      'text/html',
    );
    const script = sourceDocument.querySelector('script:not([type]):not([src])')!.textContent;
    const replaceState = vi.fn();
    runInNewContext(script, {
      document: targetDocument,
      window: {
        location: {
          hash,
          hostname: 'gaps.getlacuna.app',
          protocol: 'https:',
          pathname: '/',
          search: '?source=trial',
        },
        history: { replaceState },
      },
      localStorage: {
        getItem() {
          throw new Error('Storage denied');
        },
      },
    });
    expect(targetDocument.documentElement.hasAttribute('data-app-starting')).toBe(true);
    if (hash.startsWith('#/')) expect(replaceState).not.toHaveBeenCalled();
    else expect(replaceState).toHaveBeenCalledWith(null, '', '/?source=trial#/teach');
  },
);

it.each(['script', 'SCRIPT'])(
  'suppresses the packaged app prerender before its preload API is available (%s tags)',
  (tagName) => {
    const targetDocument = document.implementation.createHTMLDocument();
    const html = readFileSync('index.html', 'utf8')
      .replaceAll('<script>', `<${tagName}>`)
      .replaceAll('</script>', `</${tagName}>`);
    const sourceDocument = new DOMParser().parseFromString(html, 'text/html');
    const script = sourceDocument.querySelector('script:not([type]):not([src])')!.textContent;
    runInNewContext(script, {
      document: targetDocument,
      window: { location: { hash: '', protocol: 'app:' } },
      localStorage: {
        getItem() {
          throw new Error('Storage denied');
        },
      },
    });
    expect(targetDocument.documentElement.hasAttribute('data-app-starting')).toBe(true);
    expect(targetDocument.documentElement.classList.contains('dark')).toBe(true);
  },
);
