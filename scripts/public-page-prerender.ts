import { createServer, type Plugin, type ViteDevServer } from 'vite';

/** Render the same React page that the browser hydrates; no separate SEO copy. */
export function publicPagePrerenderPlugin(): Plugin {
  let renderer: ViteDevServer | undefined;
  return {
    name: 'lacuna-public-page-prerender',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html, context) {
        if (!context.path.endsWith('/compare/quizlet/index.html')) return html;
        renderer = await createServer({
          configFile: false,
          oxc: { jsx: { runtime: 'automatic', development: false } },
          server: { middlewareMode: true, watch: null },
          appType: 'custom',
        });
        try {
          const { render } = await renderer.ssrLoadModule('/src/pages/quizlet/entry-server.tsx');
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
          return html.replace('<!--public-page-->', markup);
        } finally {
          await renderer.close();
          renderer = undefined;
        }
      },
    },
    async closeBundle() {
      await renderer?.close();
    },
  };
}
