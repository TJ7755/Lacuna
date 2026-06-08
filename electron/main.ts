import { app, BrowserWindow, session, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initAutoUpdater } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:5173';
let mainWindow: BrowserWindow | null = null;

// Register app:// as a standard secure scheme before the app is ready so that
// the renderer gets a proper origin and CORS / COOP / COEP work correctly.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

/** Inject security headers required for SharedArrayBuffer (WASM) and CSP. */
function installSecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = {
      ...details.responseHeaders,
      'Cross-Origin-Opener-Policy': ['same-origin'],
      'Cross-Origin-Embedder-Policy': ['credentialless'],
    };
    // Allow cross-origin requests for the custom app:// protocol.
    if (details.url.startsWith('app://')) {
      headers['Access-Control-Allow-Origin'] = ['*'];
    }
    if (!isDev) {
      headers['Content-Security-Policy'] = [
        "default-src 'self' app: file:; script-src 'self' 'unsafe-inline' app: file:; style-src 'self' 'unsafe-inline' app: file:; font-src 'self' app: file:; img-src 'self' blob: data: app: file:; connect-src 'self';",
      ];
    }
    callback({ responseHeaders: headers });
  });
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

/** Serve production assets using the app:// custom protocol. */
function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    // Extract the raw path part after the scheme. We deliberately do NOT use
    // new URL().pathname because for non-special schemes (like app://) the host
    // portion would be discarded, allowing traversal via the authority section
    // (e.g. app://../../../etc/passwd would yield pathname === '/passwd').
    let rawPath: string;
    try {
      rawPath = decodeURIComponent(request.url.slice('app://'.length));
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

    // Normalise and ensure the resolved path stays inside the dist folder.
    const distPath = path.resolve(path.join(app.getAppPath(), 'dist'));
    const resolved = path.resolve(path.join(distPath, rawPath));
    const relative = path.relative(distPath, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const data = await fs.promises.readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const type = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';

      return new Response(data, {
        headers: {
          'Content-Type': type,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Inject local font-face overrides so the app works fully offline.
  mainWindow.webContents.on('did-finish-load', () => {
    try {
      const baseDir = isDev ? path.join(__dirname, '..') : __dirname;
      const fontsCssPath = path.join(baseDir, 'fonts.css');
      let css = fs.readFileSync(fontsCssPath, 'utf-8');

      // Inline font files as base64 data URLs so they resolve regardless of
      // whether the app is running from a real directory or inside an asar.
      const fontUrlRegex = /url\('\.\.\/assets\/fonts\/([^']+)'\)/g;
      const fontsDir = path.join(baseDir, 'assets', 'fonts');

      css = css.replace(fontUrlRegex, (match, fontFile) => {
        const fontPath = path.join(fontsDir, fontFile);
        try {
          const fontData = fs.readFileSync(fontPath);
          const ext = path.extname(fontPath).toLowerCase();
          const mimeType: Record<string, string> = {
            '.woff2': 'font/woff2',
            '.woff': 'font/woff',
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
          };
          const type = mimeType[ext] || 'application/octet-stream';
          return `url('data:${type};base64,${fontData.toString('base64')}')`;
        } catch {
          return match; // Fallback to original if file is missing.
        }
      });

      void mainWindow?.webContents.insertCSS(css);
    } catch {
      // fonts.css may not exist in dev mode; this is fine.
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(VITE_DEV_URL);
  } else {
    mainWindow.loadURL('app://./index.html');
  }
}

/** Single instance lock — prevent multiple windows. */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    installSecurityHeaders();

    if (!isDev) {
      registerAppProtocol();
    }

    createWindow();

    if (!isDev) {
      initAutoUpdater(mainWindow);
    }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});
