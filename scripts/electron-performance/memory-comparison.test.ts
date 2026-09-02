import { describe, expect, it } from 'vitest';
import { compareMemoryReports } from './memory-comparison';
import type { PackagedMemoryReport } from './memory-types';

function report(overrides: Partial<PackagedMemoryReport> = {}): PackagedMemoryReport {
  return {
    schemaVersion: 1,
    measuredAt: '2026-09-02T00:00:00.000Z',
    host: {
      platform: 'win32',
      arch: 'x64',
      osRelease: '10.0.26100',
      machineFingerprint: 'm'.repeat(64),
    },
    runtime: { electron: '42.0.0', chromium: '144.0.0.0', appVersion: '0.2.3' },
    executable: {
      path: 'C:/Lacuna.exe',
      sha256: 'a'.repeat(64),
      appAsarPath: 'C:/resources/app.asar',
      appAsarSha256: 'c'.repeat(64),
      harnessGitSha: 'one',
    },
    fixture: { sha256: 'f'.repeat(64), courses: 1, lessons: 100, cards: 10_000 },
    samplePolicy: { samplesPerCheckpoint: 9, sampleIntervalMs: 250, forcedGc: false },
    checkpoints: [
      {
        checkpoint: 'cold-idle',
        totals: {
          sumOfWorkingSetsBytes: {
            count: 9,
            median: 100,
            medianAbsoluteDeviation: 0,
            minimum: 100,
            maximum: 100,
          },
          privateBytes: {
            count: 9,
            median: 80,
            medianAbsoluteDeviation: 0,
            minimum: 80,
            maximum: 80,
          },
          rendererHeapUsedBytes: {
            count: 9,
            median: 40,
            medianAbsoluteDeviation: 0,
            minimum: 40,
            maximum: 40,
          },
        },
        samples: [],
      },
    ],
    launch: { packaged: true, rendererProtocol: 'app:', viteResourceCount: 0 },
    processExit: { pid: 10, exitCode: 0, signalCode: null },
    note: 'test',
    ...overrides,
  };
}

describe('memory report comparison', () => {
  it('reports signed absolute and percentage changes', () => {
    const candidate = report({
      executable: {
        path: 'C:/new.exe',
        sha256: 'b'.repeat(64),
        appAsarPath: 'C:/new/resources/app.asar',
        appAsarSha256: 'd'.repeat(64),
        harnessGitSha: 'two',
      },
      checkpoints: [
        {
          ...report().checkpoints[0]!,
          totals: {
            ...report().checkpoints[0]!.totals,
            sumOfWorkingSetsBytes: {
              count: 9,
              median: 75,
              medianAbsoluteDeviation: 0,
              minimum: 75,
              maximum: 75,
            },
          },
        },
      ],
    });
    expect(compareMemoryReports(report(), candidate).checkpoints[0]?.sumOfWorkingSetsBytes).toEqual(
      { before: 100, after: 75, absoluteChange: -25, percentageChange: -25 },
    );
  });

  it('rejects incompatible hosts, runtimes, schemas, fixtures and sample policy', () => {
    expect(() =>
      compareMemoryReports(
        report(),
        report({
          host: {
            platform: 'darwin',
            arch: 'arm64',
            osRelease: '25.0.0',
            machineFingerprint: 'm'.repeat(64),
          },
        }),
      ),
    ).toThrow('incompatible');
    expect(() =>
      compareMemoryReports(
        report(),
        report({ runtime: { electron: '43', chromium: '145', appVersion: '0.2.3' } }),
      ),
    ).toThrow('incompatible');
    expect(() => compareMemoryReports(report(), report({ schemaVersion: 2 }))).toThrow(
      'incompatible',
    );
    expect(() =>
      compareMemoryReports(
        report(),
        report({ fixture: { sha256: 'x', courses: 1, lessons: 100, cards: 10_000 } }),
      ),
    ).toThrow('incompatible');
    expect(() =>
      compareMemoryReports(
        report(),
        report({
          samplePolicy: { samplesPerCheckpoint: 7, sampleIntervalMs: 250, forcedGc: false },
        }),
      ),
    ).toThrow('incompatible');
    expect(() =>
      compareMemoryReports(
        report(),
        report({
          checkpoints: [
            {
              ...report().checkpoints[0]!,
              totals: {
                sumOfWorkingSetsBytes: report().checkpoints[0]!.totals.sumOfWorkingSetsBytes,
                rendererHeapUsedBytes: report().checkpoints[0]!.totals.rendererHeapUsedBytes,
              },
            },
          ],
        }),
      ),
    ).toThrow('incompatible');
    expect(() =>
      compareMemoryReports(
        report(),
        report({
          host: {
            ...report().host,
            machineFingerprint: 'n'.repeat(64),
          },
        }),
      ),
    ).toThrow('incompatible');
  });
});
