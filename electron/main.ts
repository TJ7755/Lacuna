import { app, BrowserWindow, session, protocol, ipcMain, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initAutoUpdater } from './updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// electron/mcp/server.ts is built separately (esbuild, see electron/mcp/build.mjs) rather
// than by this file's own `tsc -p electron/tsconfig.json` project — see that file's build
// comment for why. Typed loosely at this boundary via a local interface rather than a
// static import, so main.ts's own tsc project does not need to resolve the mcp/ module
// graph; `bun run typecheck:electron` type-checks electron/mcp/ separately.
interface McpServerModule {
  startMcpServer: (getWindow: () => BrowserWindow | null) => Promise<void>;
  stopMcpServer: () => Promise<void>;
  getMcpStatus: () => { running: boolean; toolCount: number; toolSurfaceVersion: number };
}

const isDev = !app.isPackaged;
const VITE_DEV_URL = 'http://localhost:5173';
let mainWindow: BrowserWindow | null = null;
let mcpModule: McpServerModule | null = null;

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

function readWindowState(): WindowState {
  const defaults: WindowState = {
    width: 1200,
    height: 800,
    x: 0,
    y: 0,
    maximized: false,
  };
  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data) as Partial<WindowState>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

let windowStateWrite = Promise.resolve();

function writeWindowState(state: WindowState): Promise<void> {
  windowStateWrite = windowStateWrite
    .then(() => fs.promises.writeFile(STATE_FILE, JSON.stringify(state), 'utf-8'))
    .catch(() => {
      // State persistence is best-effort; never let it break the app.
    });
  return windowStateWrite;
}

function ensureWindowVisible(state: WindowState): WindowState {
  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  // Ensure the window is within the current work area. If it would be off-screen,
  // reset to a sensible default so the window is not lost.
  const visible =
    state.x + state.width >= workArea.x &&
    state.y + state.height >= workArea.y &&
    state.x <= workArea.x + workArea.width &&
    state.y <= workArea.y + workArea.height;
  if (visible) return state;
  return {
    ...state,
    x: workArea.x + Math.floor((workArea.width - state.width) / 2),
    y: workArea.y + Math.floor((workArea.height - state.height) / 2),
  };
}

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
  const savedState = ensureWindowVisible(readWindowState());

  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (savedState.maximized) {
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Persist window state on resize, move, and close.
  const saveState = (): Promise<void> => {
    if (!mainWindow) return Promise.resolve();
    const maximized = mainWindow.isMaximized();
    const bounds = mainWindow.getNormalBounds();
    return writeWindowState({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized,
    });
  };

  let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSaveState = (): void => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
      saveStateTimer = null;
      void saveState();
    }, 250);
  };

  mainWindow.on('resize', scheduleSaveState);
  mainWindow.on('move', scheduleSaveState);
  mainWindow.on('close', () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = null;
    void saveState();
  });

  // Notify renderer of maximized changes so the titlebar can update its icon.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizedChange', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizedChange', false);
  });

  // Inject local font-face overrides so the app works fully offline.
  mainWindow.webContents.on('did-finish-load', () => {
    try {
      const baseDir = path.join(__dirname, '..');
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
    void mainWindow.loadURL(VITE_DEV_URL);
  } else {
    void mainWindow.loadURL('app://./index.html');
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

  void app.whenReady().then(async () => {
    installSecurityHeaders();

    if (!isDev) {
      registerAppProtocol();
    }

    createWindow();

    if (!isDev) {
      initAutoUpdater();
    }

    // Window control IPC handlers for the custom titlebar.
    ipcMain.on('window:minimize', () => {
      mainWindow?.minimize();
    });

    ipcMain.on('window:maximize', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow?.maximize();
      }
    });

    ipcMain.on('window:close', () => {
      mainWindow?.close();
    });

    ipcMain.handle('window:isMaximized', () => {
      return mainWindow?.isMaximized() ?? false;
    });

    // Starts the stdio MCP server unconditionally alongside the window (Arc 2 §2.6): the
    // single-instance lock above already guarantees at most one main-process instance, so
    // at most one stdio server ever runs. See electron/mcp/server.ts's module doc comment
    // for the invocation command and the stdout-corruption mitigation.
    //
    // The specifier is built from a variable, not a string literal, so tsc does not
    // statically resolve and pull electron/mcp/server.ts (and, transitively, the whole
    // src/mcp/registry.ts module graph) into *this* project's program — that graph is
    // type-checked separately by tsc -p electron/tsconfig.mcp.json, which resolves it the
    // way the rest of src/ does (see that file's build comment). A literal specifier here
    // would drag those files under this project's NodeNext resolution and rootDir instead.
    const mcpServerModulePath = './mcp/server.js';
    const mcp = (await import(mcpServerModulePath)) as McpServerModule;
    mcpModule = mcp;
    await mcp.startMcpServer(() => mainWindow);

    ipcMain.handle('mcp:status', () => mcpModule?.getMcpStatus() ?? { running: false, toolCount: 0, toolSurfaceVersion: 0 });
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  void mcpModule?.stopMcpServer();
});
