import { describe, expect, it } from 'vitest';
import {
  normaliseElectronProcessMetrics,
  normaliseMainMemory,
  summariseProcessMemory,
  type ElectronAppMetric,
} from './process-memory';

const metrics: ElectronAppMetric[] = [
  {
    pid: 10,
    type: 'Browser',
    name: 'Lacuna',
    creationTime: 1,
    memory: { workingSetSize: 100, peakWorkingSetSize: 120, privateBytes: 80 },
  },
  {
    pid: 11,
    type: 'Tab',
    name: 'Lacuna',
    creationTime: 2,
    memory: { workingSetSize: 200, peakWorkingSetSize: 220, privateBytes: 150 },
  },
];

describe('Electron process memory normalisation', () => {
  it('normalises Electron kilobytes to bytes with exact process roles', () => {
    expect(normaliseElectronProcessMetrics(metrics, 10, 11)).toEqual([
      {
        pid: 10,
        role: 'main',
        type: 'Browser',
        name: 'Lacuna',
        creationTime: 1,
        workingSetBytes: 102_400,
        peakWorkingSetBytes: 122_880,
        privateBytes: 81_920,
      },
      {
        pid: 11,
        role: 'renderer',
        type: 'Tab',
        name: 'Lacuna',
        creationTime: 2,
        workingSetBytes: 204_800,
        peakWorkingSetBytes: 225_280,
        privateBytes: 153_600,
      },
    ]);
  });

  it('normalises main-process memory without duplicating kilobyte fields', () => {
    expect(
      normaliseMainMemory(
        { private: 50, shared: 40, residentSet: 90 },
        {
          rss: 1,
          heapTotal: 2,
          heapUsed: 3,
          external: 4,
          arrayBuffers: 5,
        },
      ),
    ).toEqual({
      privateBytes: 51_200,
      sharedBytes: 40_960,
      residentSetBytes: 92_160,
      heapTotalBytes: 2,
      heapUsedBytes: 3,
      externalBytes: 4,
      arrayBuffersBytes: 5,
    });
  });

  it('never adds shared memory into working-set or private totals', () => {
    const summary = summariseProcessMemory(normaliseElectronProcessMetrics(metrics, 10, 11));

    expect(summary.sumOfWorkingSetsBytes).toBe(300 * 1024);
    expect(summary.privateBytes).toBe(230 * 1024);
  });
});
