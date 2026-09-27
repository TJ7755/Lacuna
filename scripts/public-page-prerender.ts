import { createServer, type Plugin, type ViteDevServer } from 'vite';

interface PublicPage {
  /** The built HTML path reported by transformIndexHtml. */
  path: string;
  /** The server module rendering the same React tree the browser hydrates. */
  module: string;
  /** The placeholder replaced with rendered markup. */
  placeholder: string;
}

/** Render the same React page that the browser hydrates; no separate SEO copy. */
export function publicPagePrerenderPlugin(): Plugin {
  let renderer: ViteDevServer | undefined;
  const pages: PublicPage[] = [
    {
      path: '/compare/quizlet/index.html',
      module: '/src/pages/quizlet/entry-server.tsx',
      placeholder: '<!--public-page-->',
    },
    {
      path: 'index.html',
      module: '/src/pages/landing/entry-server.tsx',
      placeholder: '<!--landing-page-->',
    },
  ];
  return {
    name: 'lacuna-public-page-prerender',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        const page = pages.find((candidate) =>
          candidate.path === 'index.html'
            ? context.path === 'index.html' || context.path.endsWith('/index.html')
            : context.path.endsWith(candidate.path),
        );
        if (!page) return html;
        renderer = await createServer({
          configFile: false,
          oxc: { jsx: { runtime: 'automatic', development: false } },
          server: { middlewareMode: true, watch: null },
          appType: 'custom',
        });
        try {
          const { render } = await renderer.ssrLoadModule(page.module);
          let markup: string = await render();
          // SSR's source asset paths must match the URLs emitted by the client build.
          for (const asset of Object.values(context.bundle ?? {})) {
            if (asset.type !== 'asset') continue;
            for (const original of asset.originalFileNames) {
              markup = markup.replaceAll(`/${original}`, `/${asset.fileName}`);
            }
          }
          if (markup.includes('/src/'))
            throw new Error('Unresolved public-page asset in rendered HTML.');
          return html.replace(page.placeholder, markup);
        } finally {
          await renderer?.close();
          renderer = undefined;
        }
      },
    },
    async closeBundle() {
      await renderer?.close();
      renderer = undefined;
    },
  };
}
