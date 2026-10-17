import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel configuration', () => {
  it('pins installation and builds to the Bun release required by web typechecking', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      installCommand?: string;
      buildCommand?: string;
    };
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      packageManager: string;
    };

    expect(config.installCommand).toBe(`bunx ${manifest.packageManager} install --frozen-lockfile`);
    expect(config.buildCommand).toBe(`bunx ${manifest.packageManager} run build`);
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

  it('lets locally stored audio play under both web policies', async () => {
    // Regression for #459: without media-src, default-src 'self' blocked the
    // blob: URLs that assetCache hands to <audio>, so audio cards never played.
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

    for (const policy of [headerPolicy, metaPolicy]) {
      const sources = /(?:^|;\s*)media-src\s+([^;]*)/.exec(policy)?.[1].trim().split(/\s+/);
      expect(sources).toEqual(["'self'", 'blob:']);
    }
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

  it('serves every font from the app origin', async () => {
    // Fonts are bundled in public/fonts so school networks and offline reloads
    // never depend on Google Fonts.
    const config = await readFile('vercel.json', 'utf8');
    const pages = await Promise.all(
      ['index.html', 'compare/quizlet/index.html'].map((path) => readFile(path, 'utf8')),
    );
    for (const source of [config, ...pages]) {
      expect(source).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
    }

    const styles = await readFile('src/index.css', 'utf8');
    const faces = [...styles.matchAll(/font-family: '([^']+)';\s*src: url\('([^']+)'\)/g)];
    expect(faces.map(([, family]) => family)).toEqual(
      expect.arrayContaining(['Instrument Sans', 'Space Grotesk', 'JetBrains Mono']),
    );
    for (const [, , url] of faces) {
      await expect(readFile(`public${url}`)).resolves.toBeInstanceOf(Buffer);
    }
  });
});
