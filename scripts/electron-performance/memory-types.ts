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

export type ElectronProcessRole =
  | 'main'
  | 'renderer'
  | 'gpu'
  | 'network-service'
  | 'utility'
  | 'crashpad'
  | 'ai-companion'
  | 'mcp-companion'
  | 'other';

export interface NormalisedProcessMemory {
  pid: number;
  role: ElectronProcessRole;
  type: string;
  name: string;
  serviceName?: string;
  creationTime: number;
  workingSetBytes: number;
  peakWorkingSetBytes: number;
  privateBytes?: number;
}

export interface RendererMemory {
  heapUsedBytes: number;
  heapTotalBytes: number;
  backingStorageBytes: number;
  documents: number;
  nodes: number;
  jsEventListeners: number;
}

export interface MainMemory {
  privateBytes: number;
  sharedBytes: number;
  residentSetBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

export interface PackagedMemoryRawSample {
  sampledAt: string;
  processes: NormalisedProcessMemory[];
  sumOfWorkingSetsBytes: number;
  privateBytes?: number;
  main: MainMemory;
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
    sumOfWorkingSetsBytes: MemorySeriesSummary;
    privateBytes?: MemorySeriesSummary;
    rendererHeapUsedBytes: MemorySeriesSummary;
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
