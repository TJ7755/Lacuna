import { isWebsiteAnalyticsAllowed } from './state/productAnalytics';

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

/** Hosted web only: production getlacuna.app, opted in, DNT/GPC respected, no Electron. */
export function installSimpleAnalytics({
  targetDocument = document,
  isProduction = import.meta.env.PROD,
  origin = window.location.origin,
  productAnalyticsEnabled,
}: {
  targetDocument?: Document;
  isProduction?: boolean;
  origin?: string;
  /** Test seam for the device opt-out; defaults to the stored preference. */
  productAnalyticsEnabled?: boolean;
} = {}): void {
  if (!isProduction || origin !== 'https://getlacuna.app') return;
  if (!isWebsiteAnalyticsAllowed({ origin, isProduction, productAnalyticsEnabled })) {
    removeSimpleAnalytics(targetDocument);
    return;
  }
  installProductEventPlaceholder(targetDocument);

  const source = 'https://scripts.simpleanalyticscdn.com/latest.js';
  if (targetDocument.querySelector(`script[src="${source}"]`)) return;

  const script = targetDocument.createElement('script');
  script.src = source;
  script.async = true;
  // Use CORS so the hosted site's cross-origin isolation permits this script.
  script.crossOrigin = 'anonymous';
  targetDocument.body.append(script);
}

/**
 * Queue product counts until Simple Analytics loads. Events fired before the
 * embed arrives would otherwise be lost; the queued calls flush in order once
 * the real `sa_event` replaces this placeholder.
 */
export function installProductEventPlaceholder(targetDocument: Document = document): void {
  if (targetDocument.querySelector('script[data-product-analytics-placeholder="sa_event"]')) return;
  const placeholder = targetDocument.createElement('script');
  placeholder.dataset.productAnalyticsPlaceholder = 'sa_event';
  placeholder.textContent =
    'window.sa_event=window.sa_event||function(){var a=[].slice.call(arguments);window.sa_event.q?window.sa_event.q.push(a):window.sa_event.q=[a]};';
  targetDocument.head.append(placeholder);
}

/** Remove a previously installed Simple Analytics script after opting out. */
export function removeSimpleAnalytics(targetDocument: Document = document): void {
  const scripts = targetDocument.querySelectorAll(
    'script[src="https://scripts.simpleanalyticscdn.com/latest.js"]',
  );
  scripts.forEach((script) => script.remove());
  const placeholder = targetDocument.querySelector(
    'script[data-product-analytics-placeholder="sa_event"]',
  );
  placeholder?.remove();
}
