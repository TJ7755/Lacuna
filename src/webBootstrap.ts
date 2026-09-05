const GOOGLE_FONTS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&display=swap';

function isHostedWebProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/** Add remote font resources only where the web CSP and network model permit them. */
export function installHostedFontLinks(
  targetDocument: Document = document,
  protocol: string = window.location.protocol,
): void {
  if (!isHostedWebProtocol(protocol)) return;

  const googlePreconnect = targetDocument.createElement('link');
  googlePreconnect.rel = 'preconnect';
  googlePreconnect.href = 'https://fonts.googleapis.com';

  const staticPreconnect = targetDocument.createElement('link');
  staticPreconnect.rel = 'preconnect';
  staticPreconnect.href = 'https://fonts.gstatic.com';
  staticPreconnect.crossOrigin = 'anonymous';

  const stylesheet = targetDocument.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = GOOGLE_FONTS_STYLESHEET;

  targetDocument.head.append(googlePreconnect, staticPreconnect, stylesheet);
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
