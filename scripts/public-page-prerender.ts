import { coursePaths } from '../src/pages/courses/content.ts';
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
            ? context.path === '/index.html' || context.path === 'index.html'
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
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const template = bundle['courses/index.html'];
        if (!template || template.type !== 'asset') return;
        const server = await createServer({
          configFile: false,
          oxc: { jsx: { runtime: 'automatic', development: false } },
          server: { middlewareMode: true, watch: null },
          appType: 'custom',
        });
        try {
          const { render, renderHead } = await server.ssrLoadModule(
            '/src/pages/courses/entry-server.tsx',
          );
          const html = String(template.source);
          for (const path of coursePaths) {
            const markup = await render(path);
            const source = html
              .replace(/<!--course-head-->[\s\S]*?<!--\/course-head-->/, () => renderHead(path))
              .replace(/<!--course-body-->[\s\S]*?<!--\/course-body-->/, () => markup);

            if (path === '/courses/') template.source = source;
            else
              this.emitFile({
                type: 'asset',
                fileName: `${path.slice(1)}index.html`,
                source,
              });
          }
        } finally {
          await server.close();
        }
      },
    },
    async closeBundle() {
      await renderer?.close();
      renderer = undefined;
    },
  };
}
