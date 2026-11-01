import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { expect, it, vi } from 'vitest';
import { publicPagePrerenderPlugin } from './public-page-prerender';

vi.mock('vite', () => ({
  createServer: async () => ({
    ssrLoadModule: async (module: string) => {
      expect(existsSync(resolve(module.slice(1)))).toBe(true);
      return { render: () => '<main>Landing</main>' };
    },
    close: async () => {},
  }),
}));

it.each([false, true])('keeps entry URLs inside their script when app=%s', async (app) => {
  const dependency = 'assets/</script><script>globalThis.injected=true</script><!--.js';
  const chunk = (fileName: string, module: string) => ({
    type: 'chunk',
    fileName,
    moduleIds: [module],
    imports: [dependency],
  });
  const plugin = publicPagePrerenderPlugin();
  const transform = plugin.transformIndexHtml;
  if (!transform || typeof transform !== 'object' || !('handler' in transform)) {
    throw new Error('Missing public-page HTML handler');
  }
  const result = await transform.handler(
    '<html><head><script type="module" crossorigin src="/assets/app.js"></script></head><body><!--landing-page--></body></html>',
    {
      path: '/index.html',
      filename: '/index.html',
      bundle: {
        'assets/app.js': chunk('assets/app.js', '/src/main.tsx'),
        'assets/landing.js': chunk('assets/landing.js', '/src/landingBootstrap.ts'),
        'assets/hydration.js': chunk('assets/hydration.js', '/src/pages/landing/entry-client.tsx'),
      },
    } as Parameters<typeof transform.handler>[1],
  );
  const html = typeof result === 'object' && 'html' in result ? result.html : result;
  if (typeof html !== 'string') throw new Error('Missing rendered HTML');
  const view = new Window();
  try {
    view.document.documentElement.innerHTML = html;
    const scripts = view.document.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    if (app) view.document.documentElement.setAttribute('data-app-starting', '');
    const context = { document: view.document, injected: false };
    runInNewContext(scripts[0].textContent, context);
    expect(context.injected).toBe(false);
    expect(view.document.querySelector('script[type="module"]')?.getAttribute('src')).toBe(
      app ? '/assets/app.js' : '/assets/landing.js',
    );
    expect(view.document.querySelector('link[rel="modulepreload"]')?.getAttribute('href')).toBe(
      `/${dependency}`,
    );
  } finally {
    await view.happyDOM.close();
  }
});
