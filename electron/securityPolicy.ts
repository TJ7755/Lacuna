export type RendererEnvironment = 'development' | 'production';

export const VITE_RENDERER_ORIGIN = 'http://localhost:5173';
const APP_RENDERER_HOST = '.';
const ALLOWED_MEDIA_TYPES = new Set(['audio', 'video']);

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
