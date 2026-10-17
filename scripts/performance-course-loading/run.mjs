// One Chromium process, one page at a time; production bundles only.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const beforeDir = process.argv[2] ?? '/tmp/lacuna-loading-before';
const afterDir = process.argv[3] ?? '/tmp/lacuna-loading-after';
const signal = '/tmp/lacuna-course-loading-fixed-ready';
const resultsPath = '/tmp/lacuna-course-loading-results.json';
const servers = [];
const browser = await chromium.launch({ headless: true });
const results = {};

async function measureBuild(label, directory, port) {
  const server = spawn('bunx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--outDir', directory], { stdio: 'ignore' });
  servers.push(server);
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {
      // Connection failures are expected until the preview server is ready.
    }
    if (attempt > 100) throw new Error('Preview failed to start');
    await delay(100);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', error => console.error(label, error.message));
  await page.goto(origin);
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
  await page.getByRole('region', { name: 'Today, most urgent first' }).waitFor();
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const open = indexedDB.open('lacuna');
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    const read = name => new Promise((resolve, reject) => {
      const request = database.transaction(name).objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const [courses, lessons, cards, units, assessments] = await Promise.all(['courses', 'lessons', 'cards', 'schedulingUnits', 'courseAssessments'].map(read));
    const now = Date.now();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#268075'; ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#ede8c9'; ctx.font = '40px sans-serif'; ctx.fillText('Cell structure', 50, 250);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await new Promise((resolve, reject) => {
      const tx = database.transaction([...database.objectStoreNames], 'readwrite');
      for (const name of database.objectStoreNames) if (name !== 'appState') tx.objectStore(name).clear();
      for (const [index, name] of ['Biology', 'Chemistry', 'Physics'].entries()) {
        const id = `fixture-${index}`;
        tx.objectStore('courseAssessments').put({ ...assessments.find(a => a.kind === 'final'), id: `${id}-final`, courseId: id });
        tx.objectStore('courses').put({ ...courses[0], id, name, archived: false, lessonViewMode: 'study', autoPractice: false, createdAt: now, updatedAt: now });
        for (let l = 0; l < 8; l++) {
          const lessonId = `${id}-lesson-${l}`;
          tx.objectStore('lessons').put({ ...lessons[0], id: lessonId, courseId: id, name: `${name} topic ${l + 1}`, orderIndex: l, releaseDate: undefined });
          tx.objectStore('schedulingUnits').put({ ...units[0], id: `${lessonId}-unit`, courseId: id, lessonId });
        }
        for (let c = 0; c < 322; c++) {
          const lessonId = `${id}-lesson-${c % 8}`;
          const hash = (index * 322 + c + 1).toString(16).padStart(64, '0');
          if (c % 2 === 0) tx.objectStore('assets').put({ hash, blob: bytes, mimeType: 'image/png', kind: 'image', width: 512, height: 512, createdAt: now });
          tx.objectStore('cards').put({ ...cards[0], id: `${id}-card-${c}`, conceptId: `${id}-concept-${c}`, courseId: id, primaryLessonId: lessonId, schedulingUnitId: `${lessonId}-unit`, deckId: `${lessonId}-unit`, front: `What is ${name} structure ${c + 1}?${c % 2 === 0 ? `\n\n![Cell](lacuna-asset://${hash})` : ''}`, back: `Explanation ${c + 1}`, state: c % 3 === 0 ? 0 : 2, stability: c % 3 === 0 ? null : 12, difficulty: c % 3 === 0 ? null : 5, reps: c % 3 === 0 ? 0 : 6, lapses: 0, due: c % 3 === 0 ? null : now - 1000, lastReviewed: c % 3 === 0 ? null : now - 86400000, history: [], createdAt: now, updatedAt: now });
        }
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  // Reload after native IDB fixture writes so Dexie sees the complete fixture.
  await page.reload();
  await page.getByRole('region', { name: 'Today, most urgent first' }).waitFor().catch(async error => { console.error(await page.locator('body').innerText()); throw error; });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 750000, uploadThroughput: 125000 });
  await page.addInitScript(() => { window.__falseEmpty = []; });
  const rows = [];
  async function navigate(name, action, ready) {
    await page.evaluate(() => {
      window.__loading = { started: performance.now(), count: 0, duration: 0, kinds: {}, previous: false, last: performance.now(), falseEmpty: false, longTasks: [], reads: {} };
      const state = window.__loading;
      state.observer = new PerformanceObserver(list => state.longTasks.push(...list.getEntries().map(e => e.duration)));
      state.observer.observe({ type: 'longtask' });
      const sample = now => {
        if (window.__loading !== state || state.done) return;
        const main = document.querySelector('main') ?? document.body;
        const visible = element => {
          if (!element.getBoundingClientRect().height) return false;
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.visibility === 'hidden' || style.display === 'none' || +style.opacity === 0) return false;
          }
          return true;
        };
        const pulses = [...main.querySelectorAll('.animate-pulse')].filter(visible);
        const text = [...main.querySelectorAll('p, span')].find(e => /^Loading (course|Questions)/.test(e.textContent ?? '') && visible(e));
        let kind;
        if (text) kind = text.textContent;
        else if (pulses.some(e => e.classList.contains('h-14') && e.classList.contains('w-14'))) kind = 'path skeleton';
        else if (pulses.length) kind = main.querySelector('[class*="h-[60vh]"]') ? 'route skeleton' : 'page skeleton';
        const loading = !!kind;
        if (loading && !state.previous) state.count++;
        const dt = now - state.last;
        if (state.previous) state.duration += dt;
        if (kind) state.kinds[kind] = (state.kinds[kind] ?? 0) + dt;
        state.falseEmpty ||= document.body.textContent.includes('No courses yet.');
        state.previous = loading; state.last = now;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await action();
    await ready();
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const state = window.__loading; state.done = true; state.observer.disconnect();
      return { count: state.count, visibleMs: Math.round(state.duration), fallbacks: Object.fromEntries(Object.entries(state.kinds).map(([k, v]) => [k, Math.round(v)])), falseEmpty: state.falseEmpty, longTasks: state.longTasks.length, maxLongTaskMs: Math.round(Math.max(0, ...state.longTasks)) };
    });
    rows.push({ navigation: name, ...result });
    console.log(label, JSON.stringify(rows.at(-1)));
  }
  const courseReady = () => page.getByRole('heading', { name: 'Biology', exact: true }).waitFor();
  const link = async path => {
    const parts = path.split('/');
    const names = { cards: 'Cards', questions: 'Questions', analytics: 'Progress', settings: 'Settings' };
    const name = path === '/' ? 'Today' : names[parts[3]] ?? (parts[2] === 'fixture-1' ? 'Chemistry' : 'Biology');
    const scope = names[parts[3]] ? page.getByRole('navigation', { name: 'Course sections' }).first() : page;
    await scope.getByRole('link', { name, exact: true }).first().evaluate(a => a.click());
  };
  await navigate('First visit (Today to course)', () => link('/course/fixture-0'), courseReady);
  await link('/course/fixture-1');
  await page.getByRole('heading', { name: 'Chemistry', exact: true }).waitFor();
  await navigate('Revisit course', () => link('/course/fixture-0'), courseReady);
  for (const [tab, suffix, selector] of [
    ['Cards', '/cards', '[aria-label="Search all cards"]'],
    ['Questions', '/questions', 'h1'],
    ['Progress', '/analytics', 'h1'],
    ['Settings', '/settings', 'h1'],
    ['Path', '', 'h1'],
  ]) {
    await navigate(`Tab: ${tab}`, () => link(`/course/fixture-0${suffix}`), async () => {
      await page.waitForURL(`**/#/course/fixture-0${suffix}`);
      await page.locator(`[data-route-content="/course/fixture-0${suffix}"] ${selector}`).first().waitFor();
    });
  }
  await link('/');
  await page.getByRole('region', { name: 'Today, most urgent first' }).waitFor();
  await navigate('Today to known course', () => link('/course/fixture-0'), courseReady);
  await page.evaluate(() => { location.hash = '#/course/fixture-0/learn?mode=simple'; });
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().waitFor();
  await navigate('Return from study', () => page.getByRole('button', { name: 'Exit', exact: true }).click(), courseReady);
  await navigate('Lesson', () => page.evaluate(() => { location.hash = '#/course/fixture-0/lesson/fixture-0-lesson-0'; }), () => page.locator('[data-lesson-workspace-mode]').waitFor());
  await navigate('Return to Today', () => link('/'), () => page.getByRole('region', { name: 'Today, most urgent first' }).waitFor());
  await context.close(); server.kill();
  return rows;
}

try {
  results.before = await measureBuild('before', beforeDir, 4185);
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Baseline saved to ${resultsPath}; waiting for ${signal}`);
  for (let attempt = 0; ; attempt++) {
    try { await access(signal); break; } catch {
      // The changed build signals readiness by creating this file.
    }
    if (attempt >= 1800) throw new Error('Timed out waiting for changed production build');
    await delay(1000);
  }
  results.after = await measureBuild('after', afterDir, 4186);
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const revisit = results.after.find(row => row.navigation === 'Revisit course');
  if (revisit.count) throw new Error('Known course still shows a loading placeholder');
  if (results.after.some(row => row.falseEmpty)) throw new Error('False empty courses during loading');
} finally {
  await browser.close(); for (const server of servers) server.kill();
}
