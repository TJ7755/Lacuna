/**
 * Browser origins that may read relay responses. Auth is by bearer token, so this is defence
 * in depth rather than the access control. Clients without an Origin (the terminal companion,
 * the desktop main process) are unaffected. `RELAY_ALLOWED_ORIGINS` adds comma-separated
 * origins, for example a preview or self-hosted web build.
 */
const DEFAULT_ORIGINS = ['https://getlacuna.app', 'https://lacuna-beta-one.vercel.app', 'app://.'];
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function corsAllowOrigin(request: Request): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return '*';
  const extra = (process.env.RELAY_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim());
  return DEFAULT_ORIGINS.includes(origin) || extra.includes(origin) || LOOPBACK_ORIGIN.test(origin)
    ? origin
    : null;
}

/** Shared CORS headers; an unlisted Origin gets no Access-Control-Allow-Origin, so browsers block it. */
export function relayCorsHeaders(request: Request, exposeHeaders: string): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': exposeHeaders,
    'Access-Control-Max-Age': '86400',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  });
  const allowed = corsAllowOrigin(request);
  if (allowed) headers.set('Access-Control-Allow-Origin', allowed);
  return headers;
}
