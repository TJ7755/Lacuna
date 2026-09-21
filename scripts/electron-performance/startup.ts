import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, freemem, totalmem, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import type { Page } from '@playwright/test';
import { resolvePackagedExecutable } from './executable';
import { closePackagedApp, launchPackagedApp } from './packaged-app';
import { installLagProbe, readLagProbe, startDiagnosticTrace, saveDiagnosticTrace } from '../performance-heavy/diagnostics';

// This runner reads an existing profile. It never seeds, grades, imports or deletes data.
// Close that profile's application first; one measured process is launched per invocation.
const profile = process.env.PERF_STARTUP_PROFILE;
if (!profile) throw new Error('PERF_STARTUP_PROFILE must name the existing, closed profile.');
const output = resolve(process.env.PERF_OUTPUT ?? 'artifacts/performance/startup.json');
const reloads = Number(process.env.PERF_RELOADS ?? 5);
if (!Number.isInteger(reloads) || reloads < 0 || reloads > 30) throw new Error('PERF_RELOADS must be 0–30.');
const traceDirectory = process.env.PERF_TRACE_DIR;
const startupTrace = process.env.PERF_STARTUP_TRACE ? resolve(process.env.PERF_STARTUP_TRACE) : undefined;
if (startupTrace) await mkdir(dirname(startupTrace), { recursive: true });
const executablePath = await resolvePackagedExecutable({ appDir: process.env.LACUNA_ELECTRON_APP_DIR });
await mkdir(dirname(output), { recursive: true });

function installDashboardProbe() {
  const target = window as unknown as { __dashboardReadyMs?: number };
  const check = () => {
    const heading = document.querySelector('main h1');
    const card = document.querySelector('main button h3');
    let opacity = 1;
    for (let node = card; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    if (heading?.textContent?.trim() === 'Courses' && card?.getClientRects().length && opacity >= 0.9) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        target.__dashboardReadyMs = performance.now();
      }));
    } else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

async function waitForDashboard(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __dashboardReadyMs?: number }).__dashboardReadyMs !== undefined,
    undefined, { timeout: 60_000 });
}

async function documentMetrics(page: Page) {
  return page.evaluate(() => ({
    navigation: window.performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
    paints: window.performance.getEntriesByType('paint').map(entry => entry.toJSON()),
    observedDashboardReadyMs: (window as unknown as { __dashboardReadyMs?: number }).__dashboardReadyMs,
    resources: performance.getEntriesByType('resource').map(entry => {
      const resource = entry as PerformanceResourceTiming;
      return { name: resource.name.startsWith('app:') ? resource.name : '[external resource]',
        startTime: resource.startTime, duration: resource.duration, transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize, initiatorType: resource.initiatorType };
    }),
    visibility: document.visibilityState,
    timeOrigin: window.performance.timeOrigin,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    courseButtons: document.querySelectorAll('main button h3').length,
  }));
}

const report: Record<string, unknown> = {
  completed: false, recordedAt: new Date().toISOString(), cpu: cpus()[0]?.model,
  logicalCpus: cpus().length, totalMemoryBytes: totalmem(), windowsRelease: release(),
  initialAvailableMemoryBytes: freemem(), reloads, samples: [],
  method: 'Existing populated profile; no seeding or review actions. Launch observation includes CDP attachment and the existing 500 ms stabilisation wait. Reload readiness is observed from navigation start.',
};
const launchStart = performance.now();
report.launchRequestedAtEpochMs = Date.now();
report.startupTraced = Boolean(startupTrace);
const running = await launchPackagedApp(executablePath, resolve(profile), startupTrace);
try {
  report.connectionReadyMs = performance.now() - launchStart;
  report.appVersion = running.appVersion;
  report.browserVersion = running.browser.version();
  await running.page.evaluate(installDashboardProbe);
  await waitForDashboard(running.page);
  report.launchToDashboardObservedMs = performance.now() - launchStart;
  report.initialDocument = await documentMetrics(running.page);
  // Counts only: never extract card text, course names, sync identity or credentials.
  report.counts = await running.page.evaluate(() => new Promise<Record<string, number>>((resolveCounts, reject) => {
    const request = indexedDB.open('lacuna');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = ['courses', 'lessons', 'cards', 'reviewHistory'].filter(name => db.objectStoreNames.contains(name));
      const transaction = db.transaction(names, 'readonly');
      const counts: Record<string, number> = {};
      for (const name of names) {
        const count = transaction.objectStore(name).count();
        count.onsuccess = () => { counts[name] = count.result; };
      }
      transaction.oncomplete = () => { db.close(); resolveCounts(counts); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
  await running.page.context().addInitScript(installDashboardProbe);
  await running.page.context().addInitScript(installLagProbe);
  const cdp = await running.page.context().newCDPSession(running.page);
  await cdp.send('Performance.enable');
  for (let iteration = 0; iteration < reloads; iteration++) {
    const trace = traceDirectory && iteration === 0 ? resolve(traceDirectory, 'desktop-dashboard-reload.json') : undefined;
    if (trace) await startDiagnosticTrace(cdp);
    const started = performance.now();
    await running.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDashboard(running.page);
    const elapsedMs = performance.now() - started;
    const sample = { iteration, elapsedMs, traced: Boolean(trace),
      document: await documentMetrics(running.page), lag: await readLagProbe(running.page),
      metrics: (await cdp.send('Performance.getMetrics')).metrics,
      availableMemoryBytes: freemem() };
    if (trace) await saveDiagnosticTrace(cdp, trace);
    (report.samples as unknown[]).push(sample);
    await writeFile(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ iteration, elapsedMs, traced: Boolean(trace) }));
  }
  report.errors = running.errors;
  if (startupTrace) await new Promise(resolveWait => setTimeout(resolveWait, Math.max(0, 10_000 - (performance.now() - launchStart))));
  if (running.errors.length) throw new Error('Renderer errors were recorded.');
  report.completed = true;
} finally {
  try { report.processExit = await closePackagedApp(running); }
  finally { await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
}
