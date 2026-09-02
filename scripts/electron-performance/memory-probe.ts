import type { CDPSession } from '@playwright/test';
import type { PackagedMemoryRawSample, RendererMemory } from './memory-types';
import {
  normaliseElectronProcessMetrics,
  normaliseMainMemory,
  summariseProcessMemory,
  type ElectronAppMetric,
  type ElectronProcessMemoryInfo,
} from './process-memory';
import type { RunningPackagedApp } from './types';

interface RuntimeHeapUsage {
  usedSize: number;
  totalSize: number;
  embedderHeapUsedSize: number;
  backingStorageSize: number;
}

interface DomCounters {
  documents: number;
  nodes: number;
  jsEventListeners: number;
}

interface MainProbe {
  metrics: ElectronAppMetric[];
  processInfo: ElectronProcessMemoryInfo;
  usage: NodeJS.MemoryUsage;
  mainPid: number;
  rendererPid: number;
}

export async function readRuntimeVersions(running: RunningPackagedApp): Promise<{
  electron: string;
  chromium: string;
}> {
  return running.application.evaluate(({ app }) => ({
    electron: process.versions.electron ?? app.getVersion(),
    chromium: process.versions.chrome ?? 'unknown',
  }));
}

export async function samplePackagedMemory(
  running: RunningPackagedApp,
  cdp: CDPSession,
): Promise<PackagedMemoryRawSample> {
  const [mainProbe, heap, dom] = await Promise.all([
    running.application.evaluate(async ({ app, BrowserWindow }): Promise<MainProbe> => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      if (!window) throw new Error('The packaged memory probe found no live renderer window.');
      return {
        metrics: app.getAppMetrics() as ElectronAppMetric[],
        processInfo: await process.getProcessMemoryInfo(),
        usage: process.memoryUsage(),
        mainPid: process.pid,
        rendererPid: window.webContents.getOSProcessId(),
      };
    }),
    cdp.send('Runtime.getHeapUsage') as Promise<RuntimeHeapUsage>,
    cdp.send('Memory.getDOMCounters') as Promise<DomCounters>,
  ]);
  const processes = normaliseElectronProcessMetrics(
    mainProbe.metrics,
    mainProbe.mainPid,
    mainProbe.rendererPid,
  );
  const processSummary = summariseProcessMemory(processes);
  const renderer: RendererMemory = {
    heapUsedBytes: heap.usedSize + heap.embedderHeapUsedSize,
    heapTotalBytes: heap.totalSize,
    backingStorageBytes: heap.backingStorageSize,
    documents: dom.documents,
    nodes: dom.nodes,
    jsEventListeners: dom.jsEventListeners,
  };
  return {
    sampledAt: new Date().toISOString(),
    processes,
    sumOfWorkingSetsBytes: processSummary.sumOfWorkingSetsBytes,
    ...(process.platform === 'win32' && processSummary.privateBytes !== undefined
      ? { privateBytes: processSummary.privateBytes }
      : {}),
    main: normaliseMainMemory(mainProbe.processInfo, mainProbe.usage),
    renderer,
  };
}
