import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import path from 'node:path';
import { expect } from '@playwright/test';
import { launchInstalledElectron } from './installed-electron-probe.mjs';

assert.equal(process.platform, 'win32', 'Run this probe on an isolated Windows runner.');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const baseline = path.resolve(process.argv[2]);
assert.equal(createHash('sha256').update(await readFile(baseline)).digest('hex'),
  'f62c05fd13e240c013aab6b24f1d718d38e91c89c9633d76e4ad07db583f74db');
const root = await mkdtemp(path.join(tmpdir(), 'lacuna-release-upgrade-'));
const directory = path.join(root, 'application');
const profile = path.join(root, 'profile');
const executablePath = path.join(directory, 'Lacuna.exe');
const report = { baseline: '0.2.10', target: version, stages: [] };
let application;
const server = createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
  if (![ 'latest.yml', `Lacuna-Setup-${version}.exe`, `Lacuna-Setup-${version}.exe.blockmap` ].includes(name)) {
    response.writeHead(404).end(); return;
  }
  try {
    const data = await readFile(path.join('release', name));
    response.writeHead(200, { 'Content-Length': data.length }); response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}`;

async function install(installer) {
  const child = spawn(installer, ['/S', `/D=${directory}`], { stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Installer timed out')); }, 180_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, 0);
}

async function open(expectedVersion) {
  application = await launchInstalledElectron(executablePath, profile);
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), expectedVersion);
  assert.equal(path.resolve(await application.evaluate(({ app }) => app.getPath('userData'))), path.resolve(profile));
  if (expectedVersion === '0.2.10') {
    await application.evaluate(({ app }, url) => {
      const { createRequire } = process.getBuiltinModule('node:module');
      const updater = createRequire(`${app.getAppPath()}/package.json`)('electron-updater').autoUpdater;
      updater.setFeedURL({ provider: 'generic', url });
    }, feed);
  }
  const page = await application.firstWindow();
  const start = page.getByRole('region', { name: 'Revision around your exam', exact: true }).getByRole('link', { name: 'Start revising', exact: true });
  const courses = page.getByRole('navigation', { name: 'Courses' });
  await start.or(courses).waitFor({ state: 'visible', timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(courses).toBeVisible({ timeout: 60_000 });
  return page;
}

async function snapshot(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('lacuna');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ['courses', 'lessons', 'cards', 'reviewHistory', 'schedulingUnits'].filter(name => db.objectStoreNames.contains(name));
      const tx = db.transaction(names);
      const result = {};
      for (const name of names) {
        const read = tx.objectStore(name).getAll();
        read.onsuccess = () => { result[name] = read.result; };
      }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

try {
  await install(baseline);
  let page = await open('0.2.10');
  await expect.poll(async () => (await snapshot(page)).cards?.length ?? 0).toBeGreaterThan(0);
  await page.getByRole('navigation', { name: 'Courses' }).getByRole('link', { name: 'Welcome to Lacuna' }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).last().click();
  await page.getByRole('dialog', { name: 'Choose what to study' }).getByRole('button', { name: /^(Start|Continue):/ }).first().click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: /Show answer/i }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).reviewHistory?.length ?? 0).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await page.getByRole('dialog', { name: 'Leave this session?' }).getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Study', exact: true }).last()).toBeVisible();
  const before = await snapshot(page);
  assert(before.courses.length > 0);
  report.stages.push('baseline installed and study database populated');
  await page.evaluate(() => window.electronAPI.updater.checkForUpdates());
  await expect.poll(async () => (await page.evaluate(() => window.electronAPI.updater.getState())).phase,
    { timeout: 180_000 }).toBe('downloaded');
  assert.equal((await page.evaluate(() => window.electronAPI.updater.getState())).availableVersion, version);
  await application.evaluate(({ app }) => {
    const { createRequire } = process.getBuiltinModule('node:module');
    const updater = createRequire(`${app.getAppPath()}/package.json`)('electron-updater').autoUpdater;
    updater.quitAndInstall(true, false);
  });
  await application.waitForExit(); application = undefined;
  await expect.poll(async () => {
    try {
      try {
        await readFile(path.join(process.env.LOCALAPPDATA, 'Lacuna', 'installation-in-progress'));
        return null;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const { createRequire } = await import('node:module');
      const { extractFile, uncacheAll } = createRequire(import.meta.url)('@electron/asar');
      uncacheAll();
      return JSON.parse(extractFile(path.join(directory, 'resources', 'app.asar'), 'package.json')).version;
    } catch { return null; }
  }, { timeout: 180_000 }).toBe(version);
  report.stages.push('installed baseline updater downloaded and silently installed the release');
  page = await open(version);
  const after = await snapshot(page);
  assert.deepEqual(after, before, 'Upgrade changed existing course, lesson, card or review records');
  const updateState = await page.evaluate(() => window.electronAPI.updater.getState());
  assert.equal(updateState.mode, 'automatic');
  report.stages.push('upgraded installation launched with all study records preserved');
  report.records = Object.fromEntries(Object.entries(after).map(([name, rows]) => [name, rows.length]));
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error); throw error;
} finally {
  server.close();
  if (application) await application.close();
  await mkdir('test-results/windows-release-upgrade', { recursive: true });
  await writeFile('test-results/windows-release-upgrade/report.json', JSON.stringify(report, null, 2));
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
