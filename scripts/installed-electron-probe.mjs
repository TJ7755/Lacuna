import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

/** Attach after ordinary packaged startup, without Playwright's Electron ready-event hook. */
export async function launchInstalledElectron(executablePath, profile) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  const child = spawn(executablePath, ['--inspect=0', '--remote-debugging-port=0', `--user-data-dir=${profile}`],
    { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let inspector;
  let browser;
  let nextId = 0;
  const pending = new Map();
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  const deadline = Date.now() + 60_000;
  try {
    let nodeUrl;
    let browserUrl;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Application exited: ${output}`);
      nodeUrl = output.match(/Debugger listening on (ws:\/\/\S+)/)?.[1];
      browserUrl = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (nodeUrl && browserUrl) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!nodeUrl || !browserUrl) throw new Error(`Debugger startup timed out: ${output}`);
    const devtools = new URL(browserUrl);
    let ready = false;
    while (Date.now() < deadline) {
      const targets = await fetch(`http://${devtools.host}/json/list`).then(response => response.json());
      if (targets.some(target => target.type === 'page' && target.url.startsWith('app:') && target.title.includes('Lacuna'))) {
        ready = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Renderer startup timed out: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    inspector = new WebSocket(nodeUrl);
    await new Promise((resolve, reject) => {
      inspector.addEventListener('open', resolve, { once: true });
      inspector.addEventListener('error', reject, { once: true });
    });
    inspector.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      callback(message);
    });
    browser = await chromium.connectOverCDP(browserUrl, { timeout: 30_000 });
    const evaluate = (fn, argument) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Main-process evaluation timed out')); }, 30_000);
      pending.set(id, message => {
        clearTimeout(timer);
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
      inspector.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: {
        expression: `(${fn.toString()})(process.getBuiltinModule('node:module').createRequire(process.cwd() + '/package.json')('electron'), ${JSON.stringify(argument) ?? 'undefined'})`,
        awaitPromise: true, returnByValue: true,
      } }));
    });
    const waitForExit = async () => {
      inspector.close();
      const timer = setTimeout(() => child.kill(), 30_000);
      try {
        const code = await exited;
        if (code !== 0) throw new Error(`Application exited with ${code}: ${output}`);
      } finally { clearTimeout(timer); await browser.close(); }
    };
    return {
      evaluate,
      firstWindow: async () => browser.contexts()[0].pages()[0] ?? browser.contexts()[0].waitForEvent('page'),
      waitForExit,
      close: async () => { await evaluate(({ app }) => { setImmediate(() => app.quit()); }); await waitForExit(); },
    };
  } catch (error) {
    inspector?.close();
    await browser?.close().catch(() => {});
    child.kill();
    throw error;
  }
}
