import type { ElectronProcessRole, MainMemory, NormalisedProcessMemory } from './memory-types';

export interface ElectronAppMetric {
  pid: number;
  type: string;
  name?: string;
  serviceName?: string;
  creationTime: number;
  memory: {
    workingSetSize: number;
    peakWorkingSetSize: number;
    privateBytes?: number;
  };
}

export interface ElectronProcessMemoryInfo {
  private: number;
  shared: number;
  residentSet: number;
}

const KB = 1024;

function processRole(
  metric: ElectronAppMetric,
  mainPid: number,
  rendererPid: number,
): ElectronProcessRole {
  if (metric.pid === mainPid) return 'main';
  if (metric.pid === rendererPid) return 'renderer';
  const value = `${metric.type} ${metric.name ?? ''} ${metric.serviceName ?? ''}`.toLowerCase();
  if (value.includes('ai-companion')) return 'ai-companion';
  if (value.includes('mcp-companion')) return 'mcp-companion';
  if (value.includes('gpu')) return 'gpu';
  if (value.includes('network')) return 'network-service';
  if (value.includes('crash')) return 'crashpad';
  if (value.includes('utility')) return 'utility';
  return 'other';
}

export function normaliseElectronProcessMetrics(
  metrics: readonly ElectronAppMetric[],
  mainPid: number,
  rendererPid: number,
): NormalisedProcessMemory[] {
  return metrics
    .map((metric) => ({
      pid: metric.pid,
      role: processRole(metric, mainPid, rendererPid),
      type: metric.type,
      name: metric.name ?? '',
      ...(metric.serviceName ? { serviceName: metric.serviceName } : {}),
      creationTime: metric.creationTime,
      workingSetBytes: metric.memory.workingSetSize * KB,
      peakWorkingSetBytes: metric.memory.peakWorkingSetSize * KB,
      ...(typeof metric.memory.privateBytes === 'number'
        ? {
            privateBytes: metric.memory.privateBytes * KB,
          }
        : {}),
    }))
    .sort((left, right) => left.pid - right.pid);
}

export function normaliseMainMemory(
  processInfo: ElectronProcessMemoryInfo,
  usage: NodeJS.MemoryUsage,
): MainMemory {
  return {
    privateBytes: processInfo.private * KB,
    sharedBytes: processInfo.shared * KB,
    residentSetBytes: processInfo.residentSet * KB,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

export function summariseProcessMemory(processes: readonly NormalisedProcessMemory[]): {
  sumOfWorkingSetsBytes: number;
  privateBytes?: number;
} {
  const sumOfWorkingSetsBytes = processes.reduce(
    (total, process) => total + process.workingSetBytes,
    0,
  );
  const privateValues = processes.map((process) => process.privateBytes);
  const privateBytes = privateValues.every((value): value is number => typeof value === 'number')
    ? privateValues.reduce((total, value) => total + value, 0)
    : undefined;
  return {
    sumOfWorkingSetsBytes,
    ...(privateBytes === undefined ? {} : { privateBytes }),
  };
}
