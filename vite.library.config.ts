import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

const repository = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('apps/library', import.meta.url)),
  publicDir: `${repository}public`,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'library-entry-assets',
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
          : html;
      },
      generateBundle() {
        const files = ['icon.svg'];
        for (const name of ['InstrumentSans', 'SpaceGrotesk', 'JetBrainsMono']) {
          files.push(`fonts/${name}-Variable.ttf`, `fonts/${name}-OFL.txt`);
        }
        for (const fileName of files) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(new URL(`public/${fileName}`, import.meta.url)),
          });
        }
      },
    },
  ],
  resolve: {
    alias: { '/apps/web/src': `${repository}apps/web/src` },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [repository] } },
  build: {
    outDir: fileURLToPath(new URL('apps/library/dist', import.meta.url)),
    emptyOutDir: true,
    copyPublicDir: false,
  },
});
