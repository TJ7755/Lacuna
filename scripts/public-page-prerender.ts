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
  let base = '/';
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
    configResolved(config) {
      base = config.base;
    },
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
          let renderedHtml = html.replace(page.placeholder, markup);
          if (page.path !== 'index.html') return renderedHtml;

          // Prerendered content needs its lazy entry's CSS before JavaScript runs.
          // Follow static imports only: unrelated app routes must stay lazy.
          const bundle = context.bundle ?? {};
          const entry = Object.values(bundle).find(
            (asset) =>
              asset.type === 'chunk' &&
              asset.moduleIds.some((id) => id.endsWith('/src/pages/landing/entry-client.tsx')),
          );
          if (!entry) throw new Error('Missing landing hydration chunk.');
          const appScript = renderedHtml.match(
            /<script type="module" crossorigin src="([^"]+)"><\/script>/,
          );
          const landingEntry = Object.values(bundle).find(
            (asset) =>
              asset.type === 'chunk' &&
              asset.moduleIds.some((id) => id.endsWith('/src/landingBootstrap.ts')),
          );
          if (!appScript || !landingEntry) throw new Error('Missing homepage entry points.');
          const appFile = appScript[1].slice(base.length);
          function scriptsFor(fileName: string, visited = new Set<string>()): string[] {
            if (visited.has(fileName)) return [];
            visited.add(fileName);
            const chunk = bundle[fileName];
            return [
              `${base}${fileName}`,
              ...(chunk?.type === 'chunk'
                ? chunk.imports.flatMap((dependency) => scriptsFor(dependency, visited))
                : []),
            ];
          }
          function serialiseScripts(fileName: string): string {
            // JSON escaping alone cannot stop HTML from recognising </script>.
            return JSON.stringify(scriptsFor(fileName)).replace(/</g, '\\u003c');
          }
          // Keep the study entry eager in the build, but only fetch its graph
          // when the head's pre-paint decision selected the app. Both graphs
          // start in the head, without a bootstrap-module network round trip.
          const selectEntry = `<script>(function(){var app=document.documentElement.hasAttribute('data-app-starting');if(!app)document.documentElement.setAttribute('data-landing-entry','');var files=app?${serialiseScripts(appFile)}:${serialiseScripts(landingEntry.fileName)};var script=document.createElement('script');script.type='module';script.crossOrigin='';script.src=files[0];document.head.appendChild(script);for(var i=1;i<files.length;i++){var link=document.createElement('link');link.rel='modulepreload';link.crossOrigin='';link.href=files[i];document.head.appendChild(link);}})();</script>`;
          renderedHtml = renderedHtml
            .replace(appScript[0], () => selectEntry)
            .replace(/<link rel="modulepreload"[^>]*>/g, '');
          const visited = new Set<string>();
          const stylesheets = new Set<string>();
          function collectStyles(fileName: string): void {
            if (visited.has(fileName)) return;
            visited.add(fileName);
            const chunk = bundle[fileName];
            if (chunk?.type !== 'chunk') return;
            for (const dependency of chunk.imports) collectStyles(dependency);
            for (const stylesheet of chunk.viteMetadata?.importedCss ?? []) {
              stylesheets.add(stylesheet);
            }
          }
          collectStyles(entry.fileName);
          return {
            html: renderedHtml,
            tags: [...stylesheets]
              .map((fileName) => `${base}${fileName}`)
              .filter((href) => !html.includes(`href="${href}"`))
              .map((href) => ({
                tag: 'link',
                attrs: { rel: 'stylesheet', crossorigin: true, href },
                injectTo: 'head' as const,
              })),
          };
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
