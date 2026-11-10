import { realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const { Bun } = globalThis;
const dist = await realpath(new URL('../dist/', import.meta.url));
const prefix = dist + sep;
if (!(await Bun.file(join(dist, 'index.html')).exists()))
  throw new Error('The prebuilt Electron CI renderer is missing dist/index.html');

// Match Vite preview's isolation headers. Electron still applies its own
// renderer security policy when it loads the same localhost development origin.
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

function empty(status) {
  return new Response(null, { status, headers });
}

// These tests use hash routes. Serve the original build files without rewriting
// their content or falling back to HTML for missing assets.
Bun.serve({
  hostname: 'localhost',
  port: 5173,
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return empty(405);
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return empty(400);
    }
    if (/[\\:\0]/.test(pathname)) return empty(400);
    const assetPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const target = resolve(dist, `.${assetPath}`);
    if (!target.startsWith(prefix)) return empty(404);
    const filePath = await realpath(target).catch((error) => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
      throw error;
    });
    if (!filePath?.startsWith(prefix)) return empty(404);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return empty(404);
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: { ...headers, 'Content-Type': file.type, 'Content-Length': String(file.size) },
    });
  },
});
