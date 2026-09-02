import type { CDPSession } from '@playwright/test';
import type { PackagedMemoryRawSample, RendererMemory } from './memory-types';
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

export function parseRuntimeVersionsFromUserAgent(userAgent: string): {
  electron: string;
  chromium: string;
} {
  const electron = [...userAgent.matchAll(/(?:^|\s)Electron\/(\d+\.\d+\.\d+)(?=\s|$)/g)];
  const chromium = [...userAgent.matchAll(/(?:^|\s)Chrome\/(\d+\.\d+\.\d+\.\d+)(?=\s|$)/g)];
  if (electron.length !== 1 || chromium.length !== 1) {
    throw new Error(
      'Could not identify one exact Electron and Chromium version from the renderer.',
    );
  }
  return { electron: electron[0]![1]!, chromium: chromium[0]![1]! };
}

export async function readRuntimeVersions(running: RunningPackagedApp): Promise<{
  electron: string;
  chromium: string;
}> {
  return parseRuntimeVersionsFromUserAgent(
    await running.page.evaluate(() => window.navigator.userAgent),
  );
}

export async function samplePackagedRendererMemory(
  cdp: CDPSession,
): Promise<PackagedMemoryRawSample> {
  const [heap, dom] = await Promise.all([
    cdp.send('Runtime.getHeapUsage') as Promise<RuntimeHeapUsage>,
    cdp.send('Memory.getDOMCounters') as Promise<DomCounters>,
  ]);
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
    renderer,
  };
}
