import { SEED_FLAG_KEY } from './db/seedFlags';

/** In-app hash routes start with `#/`; any other fragment is an in-page anchor. */
export function isAppHashRoute(hash: string): boolean {
  return hash.startsWith('#/');
}

function isHostedWebProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

export interface ServiceWorkerRegistrationOptions {
  isProduction?: boolean;
  protocol?: string;
  register?: (scriptUrl: string) => Promise<unknown>;
}

/** Register the PWA worker on hosted web pages, never on Electron's app:// origin. */
export async function registerProductionServiceWorker(
  options: ServiceWorkerRegistrationOptions = {},
): Promise<boolean> {
  const isProduction = options.isProduction ?? import.meta.env.PROD;
  const protocol = options.protocol ?? window.location.protocol;
  if (
    !isProduction ||
    !isHostedWebProtocol(protocol) ||
    (!options.register && !('serviceWorker' in navigator))
  ) {
    return false;
  }

  const register =
    options.register ?? navigator.serviceWorker.register.bind(navigator.serviceWorker);
  try {
    await register('/sw.js');
    return true;
  } catch {
    // A browser policy may disable workers; this must not prevent Lacuna starting.
    return false;
  }
}


export interface LandingHydrationOptions {
  hash?: string;
  isElectron?: boolean;
  seedFlagPresent?: boolean;
  landingMarkupPresent?: boolean;
}

function readSeedFlag(): boolean {
  try {
    return localStorage.getItem(SEED_FLAG_KEY) !== null;
  } catch {
    // Storage may be unavailable; fall through to the prerender check.
    return false;
  }
}

/** First-visit browsers hydrate the prerendered landing page; the packaged app,
 * in-app hash routes and returning browsers boot the study app directly. */
export function shouldHydrateLanding({
  hash = window.location.hash,
  isElectron = window.electronAPI?.isElectron === true,
  seedFlagPresent = readSeedFlag(),
  landingMarkupPresent = !!document.getElementById('root')?.querySelector('.landing-page'),
}: LandingHydrationOptions = {}): boolean {
  if (isElectron) return false;
  // In-page anchors (for example #landing-product) stay on the landing page.
  // Anything addressing the study app through its hash routes boots the full app.
  if (hash.startsWith('#/')) return false;
  // A previous start seeded the example course, so this browser already knows
  // the app: skip the marketing flash and go straight to the dashboard.
  if (seedFlagPresent) return false;
  return landingMarkupPresent;
}

/** Keep website analytics out of desktop, development and preview sessions. */
export function installSimpleAnalytics({
  targetDocument = document,
  isProduction = import.meta.env.PROD,
  origin = window.location.origin,
}: {
  targetDocument?: Document;
  isProduction?: boolean;
  origin?: string;
} = {}): void {
  if (!isProduction || origin !== 'https://getlacuna.app') return;

  const source = 'https://scripts.simpleanalyticscdn.com/latest.js';
  if (targetDocument.querySelector(`script[src="${source}"]`)) return;

  const script = targetDocument.createElement('script');
  script.src = source;
  script.async = true;
  // Use CORS so the hosted site's cross-origin isolation permits this script.
  script.crossOrigin = 'anonymous';
  targetDocument.body.append(script);
}
