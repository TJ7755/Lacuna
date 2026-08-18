import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowRelayConnect } from './csp';

const BASE_POLICY =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';";

function metaElement(): HTMLMetaElement {
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]') as HTMLMetaElement;
}

describe('allowRelayConnect', () => {
  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = BASE_POLICY;
    document.head.appendChild(meta);
  });

  afterEach(() => {
    metaElement()?.remove();
  });

  it('adds a relay origin to connect-src', () => {
    allowRelayConnect('https://lacuna-relay.vercel.app');
    expect(metaElement().content).toContain("connect-src 'self' https://lacuna-relay.vercel.app;");
  });

  it('keeps the rest of the policy intact', () => {
    allowRelayConnect('https://relay.example');
    expect(metaElement().content).toContain("default-src 'self';");
    expect(metaElement().content).toContain("script-src 'self' 'unsafe-inline';");
  });

  it('does not add the same origin twice', () => {
    allowRelayConnect('https://relay.example');
    allowRelayConnect('https://relay.example/channel');
    const matches = metaElement().content.match(/https:\/\/relay\.example/g);
    expect(matches).toHaveLength(1);
  });

  it('ignores non-http(s) URLs', () => {
    allowRelayConnect('file:///tmp/snapshot');
    expect(metaElement().content).toBe(BASE_POLICY);
  });

  it('is a no-op when no CSP meta tag is present', () => {
    metaElement().remove();
    expect(() => allowRelayConnect('https://relay.example')).not.toThrow();
  });
});
