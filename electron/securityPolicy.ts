export type RendererEnvironment = 'development' | 'production';

export const VITE_RENDERER_ORIGIN = 'http://localhost:5173';
export const APP_RENDERER_ORIGIN = 'app://.';
const APP_RENDERER_HOST = '.';
const DEFAULT_SYNC_RELAY_ORIGIN = 'https://lacuna-relay.vercel.app';
const ALLOWED_MEDIA_TYPES = new Set(['audio', 'video']);

export type ElectronResponseHeaders = Record<string, string[]>;

function setResponseHeader(
  headers: ElectronResponseHeaders,
  name: string,
  values: string[],
): void {
  for (const existingName of Object.keys(headers)) {
    if (existingName.toLowerCase() === name.toLowerCase()) delete headers[existingName];
  }
  headers[name] = values;
}

/** Add the renderer isolation headers and repair CORS only for Lacuna's exact relay. */
export function addElectronSecurityHeaders(
  responseUrl: string,
  responseHeaders: ElectronResponseHeaders,
  environment: RendererEnvironment,
): ElectronResponseHeaders {
  const headers = { ...responseHeaders };
  setResponseHeader(headers, 'Cross-Origin-Opener-Policy', ['same-origin']);
  setResponseHeader(headers, 'Cross-Origin-Embedder-Policy', ['credentialless']);

  if (responseUrl.startsWith('app://')) {
    setResponseHeader(headers, 'Access-Control-Allow-Origin', ['*']);
  }

  if (environment === 'production') {
    try {
      if (new URL(responseUrl).origin === DEFAULT_SYNC_RELAY_ORIGIN) {
        // Some managed-device proxies strip a custom-scheme CORS value from the
        // otherwise valid relay response. The renderer is already confined to
        // APP_RENDERER_ORIGIN, so repair only this one trusted relay boundary.
        setResponseHeader(headers, 'Access-Control-Allow-Origin', [APP_RENDERER_ORIGIN]);
        setResponseHeader(headers, 'Access-Control-Allow-Methods', [
          'GET, PUT, POST, DELETE, OPTIONS',
        ]);
        setResponseHeader(headers, 'Access-Control-Allow-Headers', [
          'Authorization, Content-Type, If-Match',
        ]);
        setResponseHeader(headers, 'Access-Control-Expose-Headers', ['ETag']);
        setResponseHeader(headers, 'Cross-Origin-Resource-Policy', ['cross-origin']);
        setResponseHeader(headers, 'Vary', ['Origin']);
      }
    } catch {
      // Electron may report non-URL internal resources; isolation headers still apply.
    }
  }

  return headers;
}

export interface RendererPermissionContext {
  permission: string;
  requestingUrl?: string;
  isMainFrame: boolean;
  mediaTypes?: readonly string[];
  mediaType?: string;
}

function isTrustedRendererUrl(
  value: string | undefined,
  environment: RendererEnvironment,
): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    if (environment === 'development') {
      return parsed.origin === VITE_RENDERER_ORIGIN;
    }
    return parsed.protocol === 'app:' && parsed.host === APP_RENDERER_HOST;
  } catch {
    return false;
  }
}

/** Grant only the permissions required by Lacuna's trusted main renderer. */
export function canGrantRendererPermission(
  context: RendererPermissionContext,
  environment: RendererEnvironment,
): boolean {
  if (!context.isMainFrame || !isTrustedRendererUrl(context.requestingUrl, environment)) {
    return false;
  }

  if (context.permission === 'clipboard-sanitized-write') {
    return true;
  }

  if (context.permission !== 'media') {
    return false;
  }

  if (context.mediaTypes) {
    return (
      context.mediaTypes.length > 0 &&
      context.mediaTypes.every((type) => ALLOWED_MEDIA_TYPES.has(type))
    );
  }

  return context.mediaType !== undefined && ALLOWED_MEDIA_TYPES.has(context.mediaType);
}

/** Keep the main renderer confined to its exact production or development origin. */
export function isAllowedRendererNavigation(
  value: string,
  environment: RendererEnvironment,
): boolean {
  return isTrustedRendererUrl(value, environment);
}

/** Only ordinary web links may leave Lacuna through the operating system. */
export function isSafeExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface WindowOpenDecision {
  action: 'deny';
  openExternally: boolean;
}

/** Deny every renderer-created window, opening ordinary web links externally instead. */
export function decideWindowOpen(value: string): WindowOpenDecision {
  return { action: 'deny', openExternally: isSafeExternalUrl(value) };
}
