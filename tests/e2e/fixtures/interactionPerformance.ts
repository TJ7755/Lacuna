import type { Locator, Page, TestInfo } from '@playwright/test';

export interface InteractionMarker {
  selector: string;
  text?: string;
}

export interface InteractionSample {
  acknowledgementMs: number;
  meaningfulMs: number;
  settlementMs?: number;
  longTasks: {
    supported: boolean;
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
  };
}

export interface HoverInteractionSample {
  pointerEnterToStyleChangeMs: number;
  pointerEnterToPostPaintMs: number;
  changedProperties: string[];
}

interface HoverInteractionResult {
  sample: HoverInteractionSample;
  pointerOverAtMs: number;
}

export interface InteractionSummary {
  sampleCount: number;
  acknowledgementMs: Percentiles;
  meaningfulMs: Percentiles;
  longTasks: {
    supported: boolean;
    count: number;
    samplesWithLongTasks: number;
    totalDurationMs: number;
    maxDurationMs: number;
  };
}

export interface Percentiles {
  median: number;
  p95: number;
}

export interface InteractionPerformanceReport {
  schemaVersion: 1;
  interaction: string;
  motion: 'enabled';
  cold: {
    samples: InteractionSample[];
    summary: InteractionSummary;
  };
  warm: {
    samples: InteractionSample[];
    summary: InteractionSummary;
  };
}

interface BrowserMeasurementState {
  result?: InteractionSample;
  error?: string;
}

interface BrowserHoverMeasurementState {
  result?: HoverInteractionResult;
  error?: string;
}

const MEASUREMENT_KEY = '__lacunaInteractionMeasurement';
const HOVER_MEASUREMENT_KEY = '__lacunaHoverMeasurement';
const DEFAULT_HOVER_STYLE_PROPERTIES = ['background-color', 'color', 'transform'] as const;

/**
 * Measures the browser-visible part of one pointer interaction. The first marker is
 * an immediate visual acknowledgement; the second is a route-specific readiness
 * marker. Markers are sampled on animation frames, but their animations do not need
 * to finish: the first frame on which each marker is actually visible wins.
 */
export async function measurePointerInteraction({
  page,
  trigger,
  acknowledgement,
  meaningful,
  settled,
  timeoutMs = 15_000,
}: {
  page: Page;
  trigger: Locator;
  acknowledgement: InteractionMarker;
  meaningful: InteractionMarker;
  settled?: InteractionMarker;
  timeoutMs?: number;
}): Promise<InteractionSample> {
  await page.evaluate(
    ({ acknowledgement, meaningful, settled, timeoutMs, measurementKey }) => {
      type LongTask = Pick<PerformanceEntry, 'duration' | 'startTime'>;
      type State = BrowserMeasurementState & {
        observer?: PerformanceObserver;
        longTasks: LongTask[];
      };

      const target = globalThis as typeof globalThis & Record<string, State>;
      const previous = target[measurementKey];
      previous?.observer?.disconnect();

      const state: State = { longTasks: [] };
      target[measurementKey] = state;
      let stopped = false;

      const longTasksSupported =
        typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes.includes('longtask');
      if (longTasksSupported) {
        state.observer = new PerformanceObserver((list) => {
          state.longTasks.push(
            ...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })),
          );
        });
        state.observer.observe({ type: 'longtask', buffered: true });
      }

      function markerIsVisible(marker: InteractionMarker): boolean {
        return [...document.querySelectorAll(marker.selector)].some((candidate) => {
          if (!(candidate instanceof HTMLElement)) return false;
          if (marker.text !== undefined && candidate.textContent?.trim() !== marker.text) {
            return false;
          }

          const bounds = candidate.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) return false;
          for (
            let current: HTMLElement | null = candidate;
            current;
            current = current.parentElement
          ) {
            const style = getComputedStyle(current);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number.parseFloat(style.opacity || '1') <= 0
            ) {
              return false;
            }
          }
          return true;
        });
      }

      function markerIsSettled(marker: InteractionMarker): boolean {
        return [...document.querySelectorAll(marker.selector)].some((candidate) => {
          if (!(candidate instanceof HTMLElement) || !markerIsVisible(marker)) return false;
          const style = getComputedStyle(candidate);
          return (
            style.opacity === '1' &&
            (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)')
          );
        });
      }

      window.addEventListener(
        'pointerdown',
        () => {
          const startedAt = performance.now();
          let acknowledgementAt: number | undefined;
          let meaningfulAt: number | undefined;
          let settlementAt: number | undefined;
          const deadline = window.setTimeout(() => {
            stopped = true;
            state.observer?.disconnect();
            state.error = `Interaction markers did not appear within ${timeoutMs} ms.`;
          }, timeoutMs);

          function sampleFrame(now: number) {
            if (stopped) return;
            if (acknowledgementAt === undefined && markerIsVisible(acknowledgement)) {
              acknowledgementAt = now;
            }
            if (meaningfulAt === undefined && markerIsVisible(meaningful)) meaningfulAt = now;
            if (settled !== undefined && settlementAt === undefined && markerIsSettled(settled)) {
              settlementAt = now;
            }

            if (
              acknowledgementAt === undefined ||
              meaningfulAt === undefined ||
              (settled !== undefined && settlementAt === undefined)
            ) {
              requestAnimationFrame(sampleFrame);
              return;
            }

            window.clearTimeout(deadline);
            stopped = true;
            const completedAcknowledgementAt = acknowledgementAt;
            const completedMeaningfulAt = meaningfulAt;
            const completedSettlementAt = settlementAt;
            const measuredUntil = Math.max(
              completedAcknowledgementAt,
              completedMeaningfulAt,
              completedSettlementAt ?? 0,
            );
            // Long-task entries are delivered asynchronously. This extra frame is
            // outside the measured interval and merely lets the observer flush.
            requestAnimationFrame(() => {
              window.setTimeout(() => {
                const observerRecords = state.observer?.takeRecords() ?? [];
                state.observer?.disconnect();
                state.longTasks.push(
                  ...observerRecords.map(({ duration, startTime }) => ({ duration, startTime })),
                );
                const relevantLongTasks = state.longTasks.filter(
                  (entry) =>
                    entry.startTime < measuredUntil && entry.startTime + entry.duration > startedAt,
                );
                const durations = relevantLongTasks.map((entry) => entry.duration);
                state.result = {
                  acknowledgementMs: completedAcknowledgementAt - startedAt,
                  meaningfulMs: completedMeaningfulAt - startedAt,
                  ...(completedSettlementAt === undefined
                    ? {}
                    : { settlementMs: completedSettlementAt - startedAt }),
                  longTasks: {
                    supported: longTasksSupported,
                    count: durations.length,
                    totalDurationMs: durations.reduce((total, duration) => total + duration, 0),
                    maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
                  },
                };
              }, 0);
            });
          }

          requestAnimationFrame(sampleFrame);
        },
        { capture: true, once: true },
      );
    },
    { acknowledgement, meaningful, settled, timeoutMs, measurementKey: MEASUREMENT_KEY },
  );

  await trigger.click();
  await page.waitForFunction(
    (measurementKey) => {
      const target = globalThis as typeof globalThis &
        Record<string, BrowserMeasurementState | undefined>;
      const state = target[measurementKey];
      return state?.result !== undefined || state?.error !== undefined;
    },
    MEASUREMENT_KEY,
    { timeout: timeoutMs + 2_000 },
  );

  const state = await page.evaluate((measurementKey) => {
    const target = globalThis as typeof globalThis &
      Record<string, BrowserMeasurementState | undefined>;
    return target[measurementKey];
  }, MEASUREMENT_KEY);
  if (!state?.result)
    throw new Error(state?.error ?? 'The interaction measurement produced no result.');
  return roundSample(state.result);
}

/**
 * Measures visual hover feedback from the target's native pointerenter event. The
 * first value is the animation frame where a watched computed style first differs
 * from its pointer-away baseline. The second is the following animation-frame
 * boundary, after the browser had an opportunity to paint that changed style.
 *
 * Only paint/compositor style properties are sampled. This deliberately avoids
 * geometry reads such as getBoundingClientRect, which would force layout on every
 * frame and contaminate the measurement it is meant to observe.
 */
export async function measureHoverInteraction({
  page,
  trigger,
  properties = DEFAULT_HOVER_STYLE_PROPERTIES,
  timeoutMs = 2_000,
}: {
  page: Page;
  trigger: Locator;
  properties?: readonly string[];
  timeoutMs?: number;
}): Promise<HoverInteractionResult> {
  await trigger.evaluate(
    (candidate, { measurementKey, properties, timeoutMs }) => {
      type State = BrowserHoverMeasurementState & {
        pointerOverAtMs?: number;
      };

      if (!(candidate instanceof HTMLElement)) {
        throw new Error('The hover measurement target is not an HTML element.');
      }

      const target = globalThis as typeof globalThis & Record<string, State>;
      const state: State = {};
      target[measurementKey] = state;

      if (candidate.matches(':hover')) {
        state.error = 'The hover measurement target was already hovered.';
        return;
      }

      const baselineStyle = getComputedStyle(candidate);
      const baseline = new Map(
        properties.map((property) => [property, baselineStyle.getPropertyValue(property)]),
      );

      candidate.addEventListener(
        'pointerover',
        () => {
          state.pointerOverAtMs = performance.now();
        },
        { capture: true, once: true },
      );
      candidate.addEventListener(
        'pointerenter',
        (event) => {
          const pointerEnterAt = event.timeStamp;
          const deadline = window.setTimeout(() => {
            state.error = `Hover styles did not change within ${timeoutMs} ms.`;
          }, timeoutMs);

          function sampleFrame(now: number) {
            if (state.error !== undefined) return;
            const style = getComputedStyle(candidate);
            const changedProperties = properties.filter(
              (property) => style.getPropertyValue(property) !== baseline.get(property),
            );
            if (changedProperties.length === 0) {
              requestAnimationFrame(sampleFrame);
              return;
            }

            const styleChangeAt = now;
            requestAnimationFrame((postPaintAt) => {
              window.clearTimeout(deadline);
              if (state.pointerOverAtMs === undefined) {
                state.error = 'The hover measurement observed pointerenter without pointerover.';
                return;
              }
              state.result = {
                sample: {
                  pointerEnterToStyleChangeMs: styleChangeAt - pointerEnterAt,
                  pointerEnterToPostPaintMs: postPaintAt - pointerEnterAt,
                  changedProperties,
                },
                pointerOverAtMs: state.pointerOverAtMs,
              };
            });
          }

          requestAnimationFrame(sampleFrame);
        },
        { once: true },
      );
    },
    { measurementKey: HOVER_MEASUREMENT_KEY, properties: [...properties], timeoutMs },
  );

  await trigger.hover();
  await page.waitForFunction(
    (measurementKey) => {
      const target = globalThis as typeof globalThis &
        Record<string, BrowserHoverMeasurementState | undefined>;
      const state = target[measurementKey];
      return state?.result !== undefined || state?.error !== undefined;
    },
    HOVER_MEASUREMENT_KEY,
    { timeout: timeoutMs + 2_000 },
  );

  const state = await page.evaluate((measurementKey) => {
    const target = globalThis as typeof globalThis &
      Record<string, BrowserHoverMeasurementState | undefined>;
    return target[measurementKey];
  }, HOVER_MEASUREMENT_KEY);
  if (!state?.result) throw new Error(state?.error ?? 'The hover measurement produced no result.');
  return {
    sample: roundHoverSample(state.result.sample),
    pointerOverAtMs: state.result.pointerOverAtMs,
  };
}

export function summariseInteractionSamples(
  samples: readonly InteractionSample[],
): InteractionSummary {
  if (samples.length === 0) throw new Error('At least one interaction sample is required.');
  const longTasks = samples.flatMap((sample) =>
    sample.longTasks.count > 0 ? [sample.longTasks] : [],
  );
  return {
    sampleCount: samples.length,
    acknowledgementMs: percentiles(samples.map((sample) => sample.acknowledgementMs)),
    meaningfulMs: percentiles(samples.map((sample) => sample.meaningfulMs)),
    longTasks: {
      supported: samples.every((sample) => sample.longTasks.supported),
      count: samples.reduce((total, sample) => total + sample.longTasks.count, 0),
      samplesWithLongTasks: longTasks.length,
      totalDurationMs: round(
        samples.reduce((total, sample) => total + sample.longTasks.totalDurationMs, 0),
      ),
      maxDurationMs:
        longTasks.length > 0
          ? round(Math.max(...longTasks.map((longTask) => longTask.maxDurationMs)))
          : 0,
    },
  };
}

export async function attachInteractionPerformanceReport(
  testInfo: TestInfo,
  report: InteractionPerformanceReport,
): Promise<void> {
  await testInfo.attach('interaction-performance.json', {
    body: Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}

function percentiles(values: readonly number[]): Percentiles {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  return { median: round(median), p95: round(p95) };
}

function roundSample(sample: InteractionSample): InteractionSample {
  return {
    acknowledgementMs: round(sample.acknowledgementMs),
    meaningfulMs: round(sample.meaningfulMs),
    ...(sample.settlementMs === undefined ? {} : { settlementMs: round(sample.settlementMs) }),
    longTasks: {
      ...sample.longTasks,
      totalDurationMs: round(sample.longTasks.totalDurationMs),
      maxDurationMs: round(sample.longTasks.maxDurationMs),
    },
  };
}

function roundHoverSample(sample: HoverInteractionSample): HoverInteractionSample {
  return {
    ...sample,
    pointerEnterToStyleChangeMs: round(sample.pointerEnterToStyleChangeMs),
    pointerEnterToPostPaintMs: round(sample.pointerEnterToPostPaintMs),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
