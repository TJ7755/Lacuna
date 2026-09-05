import { describe, expect, it, vi } from 'vitest';
import { installHostedFontLinks, registerProductionServiceWorker } from './webBootstrap';

describe('hosted web bootstrap', () => {
  it('does not request hosted fonts from a packaged app origin', () => {
    const { document, links } = fakeDocument();

    installHostedFontLinks(document, 'app:');

    expect(links).toHaveLength(0);
  });

  it('loads the hosted font stylesheet for HTTP pages', () => {
    const { document, links } = fakeDocument();

    installHostedFontLinks(document, 'https:');

    expect(links).toContainEqual(
      expect.objectContaining({
        rel: 'stylesheet',
        href: expect.stringContaining('https://fonts.googleapis.com/css2'),
      }),
    );
    const stylesheet = links.find((link) => link.rel === 'stylesheet')!;
    expect(new URL(stylesheet.href).searchParams.getAll('family')).toEqual([
      'Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700',
      'JetBrains Mono:wght@400;500;600',
    ]);
  });

  it('does not attempt service-worker registration from a packaged app origin', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerProductionServiceWorker({
      isProduction: true,
      protocol: 'app:',
      register,
    });

    expect(register).not.toHaveBeenCalled();
  });

  it('registers the generated worker for a production HTTP page', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerProductionServiceWorker({
      isProduction: true,
      protocol: 'https:',
      register,
    });

    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});

function fakeDocument(): { document: Document; links: HTMLLinkElement[] } {
  const links: HTMLLinkElement[] = [];
  const document = {
    createElement: () => ({}) as HTMLLinkElement,
    head: {
      append: (...elements: HTMLLinkElement[]) => {
        links.push(...elements);
      },
    },
  } as unknown as Document;
  return { document, links };
}
