// The web CSP (index.html) and the packaged-app header (electron/main.ts) both
// ship connect-src 'self'. The sync relay is a separate origin, so the browser
// refuses every relay fetch unless that origin is listed. The default relay is
// allowed statically in both policies; this module extends the web meta policy
// at runtime so a relay URL entered in Settings is connectable as well.
// Electron's injected header is static, so custom relays remain web-only.

const CSP_META_SELECTOR = 'meta[http-equiv="Content-Security-Policy"]';

function relayOrigin(relayUrl: string): string | null {
  try {
    const url = new URL(relayUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Extend the document's connect-src with the relay's origin when the policy
 * does not already allow it. No-op outside a browser, when no CSP meta tag
 * exists, or when the URL is not an http(s) origin.
 */
export function allowRelayConnect(relayUrl: string): void {
  const origin = relayOrigin(relayUrl);
  if (origin === null) return;
  const meta = document.querySelector<HTMLMetaElement>(CSP_META_SELECTOR);
  if (!meta) return;
  const policy = meta.content;
  const match = /(connect-src\s+)([^;]*)/.exec(policy);
  if (!match) return;
  const sources = match[2].trim().split(/\s+/).filter(Boolean);
  if (sources.includes(origin)) return;
  meta.content =
    policy.slice(0, match.index) +
    `${match[1]}${[...sources, origin].join(' ')}` +
    policy.slice(match.index + match[0].length);
}
