import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  installSimpleAnalytics,
  registerProductionServiceWorker,
  shouldHydrateLanding,
} from './webBootstrap';

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

describe('landing hydration decision', () => {
  const firstVisit = {
    hash: '',
    isElectron: false,
    seedFlagPresent: false,
    landingMarkupPresent: true,
  };

  it('hydrates the prerendered landing page on a first visit', () => {
    expect(shouldHydrateLanding(firstVisit)).toBe(true);
  });

  it('keeps in-page anchors such as #landing-product on the landing page', () => {
    expect(shouldHydrateLanding({ ...firstVisit, hash: '#landing-product' })).toBe(true);
  });

  it('boots the study app for hash routes', () => {
    expect(shouldHydrateLanding({ ...firstVisit, hash: '#/cards' })).toBe(false);
    expect(shouldHydrateLanding({ ...firstVisit, hash: '#/' })).toBe(false);
  });

  it('boots the study app for Electron, seeded browsers and missing markup', () => {
    expect(shouldHydrateLanding({ ...firstVisit, isElectron: true })).toBe(false);
    expect(shouldHydrateLanding({ ...firstVisit, seedFlagPresent: true })).toBe(false);
    expect(shouldHydrateLanding({ ...firstVisit, landingMarkupPresent: false })).toBe(false);
  });

  it('honours the pre-paint app decision if storage changes before modules load', () => {
    expect(shouldHydrateLanding({ ...firstVisit, appStartPending: true })).toBe(false);
  });
});

it('suppresses the packaged app prerender before its preload API is available', () => {
  const targetDocument = document.implementation.createHTMLDocument();
  const script = readFileSync('index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script, {
    document: targetDocument,
    window: { location: { hash: '', protocol: 'app:' } },
    localStorage: { getItem() { throw new Error('Storage denied'); } },
  });
  expect(targetDocument.documentElement.hasAttribute('data-app-starting')).toBe(true);
  expect(targetDocument.documentElement.classList.contains('dark')).toBe(true);
});
