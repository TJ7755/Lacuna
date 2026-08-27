import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel static routing', () => {
  it('does not rewrite missing hashed assets to the HTML app shell', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as {
      rewrites?: { destination?: string }[];
    };

    expect(config.rewrites?.some((rewrite) => rewrite.destination === '/index.html') ?? false).toBe(
      false,
    );
  });
});
