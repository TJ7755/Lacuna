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
