import type { PackagedLaunchProof, PackagedProcessExit } from './types';

export type MemoryCheckpoint =
  | 'cold-idle'
  | 'course-open'
  | 'dashboard-returned'
  | 'study-open'
  | 'study-closed'
  | 'ai-enabled-idle'
  | 'ai-open'
  | 'ai-closed'
  | 'large-dashboard'
  | 'large-course'
  | 'large-study-open'
  | 'large-study-closed'
  | 'returned-idle';

export interface RendererMemory {
  heapUsedBytes: number;
  heapTotalBytes: number;
  backingStorageBytes: number;
  documents: number;
  nodes: number;
  jsEventListeners: number;
}

export interface PackagedMemoryRawSample {
  sampledAt: string;
  renderer: RendererMemory;
}

export interface MemorySeriesSummary {
  count: number;
  median: number;
  medianAbsoluteDeviation: number;
  minimum: number;
  maximum: number;
}

export interface PackagedMemoryCheckpointResult {
  checkpoint: MemoryCheckpoint;
  totals: {
    heapUsedBytes: MemorySeriesSummary;
    heapTotalBytes: MemorySeriesSummary;
    backingStorageBytes: MemorySeriesSummary;
    documents: MemorySeriesSummary;
    nodes: MemorySeriesSummary;
    jsEventListeners: MemorySeriesSummary;
  };
  samples: PackagedMemoryRawSample[];
}

export interface PackagedMemoryReport {
  schemaVersion: number;
  measuredAt: string;
  host: {
    platform: NodeJS.Platform;
    arch: string;
    osRelease: string;
    machineFingerprint: string;
  };
  runtime: { electron: string; chromium: string; appVersion: string };
  executable: {
    path: string;
    sha256: string;
    appAsarPath: string;
    appAsarSha256: string;
    harnessGitSha: string | null;
  };
  fixture: { sha256: string; courses: number; lessons: number; cards: number };
  samplePolicy: { samplesPerCheckpoint: number; sampleIntervalMs: number; forcedGc: false };
  checkpoints: PackagedMemoryCheckpointResult[];
  launch: Pick<PackagedLaunchProof, 'packaged' | 'rendererProtocol' | 'viteResourceCount'>;
  processExit: PackagedProcessExit;
  note: string;
}
