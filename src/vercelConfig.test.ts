import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel configuration', () => {
  it('installs from the committed Bun lockfile', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      installCommand?: string;
    };

    expect(config.installCommand).toBe('bun install --frozen-lockfile');
  });

  it('does not rewrite missing hashed assets to the HTML app shell', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites?: { destination?: string }[];
    };

    expect(config.rewrites?.some((rewrite) => rewrite.destination === '/index.html') ?? false).toBe(
      false,
    );
  });

  it('sends a Content-Security-Policy header with a restrictive framing policy', async () => {
    // Regression for #331: the hosted app had no clickjacking defence because
    // frame-ancestors cannot be expressed in the index.html meta policy.
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      headers?: { source?: string; headers?: { key?: string; value?: string }[] }[];
    };
    const documentHeaders =
      config.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? [];
    const csp =
      documentHeaders.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('keeps the header and meta policies in step on connect-src origins', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      headers?: { source?: string; headers?: { key?: string; value?: string }[] }[];
    };
    const documentHeaders =
      config.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? [];
    const headerPolicy =
      documentHeaders.find((header) => header.key === 'Content-Security-Policy')?.value ?? '';

    const document = await readFile('index.html', 'utf8');
    const metaPolicy =
      /http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/.exec(document)?.[1] ?? '';
    // frame-ancestors is ignored in a meta policy by specification, so it must
    // live in the header rather than being added to the meta tag.
    expect(metaPolicy).not.toContain('frame-ancestors');

    const connectSources = (policy: string): string[] => {
      const sources = /(?:^|;\s*)connect-src\s+([^;]*)/.exec(policy)?.[1] ?? '';
      return sources.trim().split(/\s+/).filter(Boolean).sort();
    };
    expect(headerPolicy).toContain('connect-src');
    expect(connectSources(headerPolicy)).toEqual(connectSources(metaPolicy));
  });
});
