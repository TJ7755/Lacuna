import type { Locator, Page } from '@playwright/test';

export interface InteractionMarker {
  selector: string;
  text?: string;
}

export interface InteractionSample {
  acknowledgementMs: number;
  meaningfulMs: number;
  longTasks: {
    supported: boolean;
    count: number;
    totalDurationMs: number;
    maxDurationMs: number;
  };
}

interface BrowserMeasurementState {
  result?: InteractionSample;
  error?: string;
  dispose?: () => void;
}

const MEASUREMENT_KEY = '__lacunaInteractionMeasurement';

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
  timeoutMs = 15_000,
}: {
  page: Page;
  trigger: Locator;
  acknowledgement: InteractionMarker;
  meaningful: InteractionMarker;
  timeoutMs?: number;
}): Promise<InteractionSample> {
  let failed = false;
  try {
    await page.evaluate(
      ({ acknowledgement, meaningful, timeoutMs, measurementKey }) => {
        type LongTask = Pick<PerformanceEntry, 'duration' | 'startTime'>;
        type State = BrowserMeasurementState & {
          observer?: PerformanceObserver;
          longTasks: LongTask[];
        };

        const target = globalThis as typeof globalThis & Record<string, State>;
        const previous = target[measurementKey];
        previous?.dispose?.();

        const state: State = { longTasks: [] };
        target[measurementKey] = state;
        let stopped = false;
        let disposed = false;
        let frame: number | undefined;
        let deadline: number | undefined;
        let flushTimer: number | undefined;
        state.dispose = () => {
          if (disposed) return;
          disposed = true;
          stopped = true;
          window.removeEventListener('pointerdown', pointerDown, true);
          if (frame !== undefined) cancelAnimationFrame(frame);
          if (deadline !== undefined) window.clearTimeout(deadline);
          if (flushTimer !== undefined) window.clearTimeout(flushTimer);
          state.observer?.disconnect();
        };

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

        function pointerDown() {
          const startedAt = performance.now();
          let acknowledgementAt: number | undefined;
          let meaningfulAt: number | undefined;
          deadline = window.setTimeout(() => {
            state.dispose?.();
            state.error = `Interaction markers did not appear within ${timeoutMs} ms.`;
          }, timeoutMs);

          function sampleFrame(now: number) {
            if (stopped) return;
            if (acknowledgementAt === undefined && markerIsVisible(acknowledgement)) {
              acknowledgementAt = now;
            }
            if (meaningfulAt === undefined && markerIsVisible(meaningful)) meaningfulAt = now;

            if (acknowledgementAt === undefined || meaningfulAt === undefined) {
              frame = requestAnimationFrame(sampleFrame);
              return;
            }

            const acknowledgementTime = acknowledgementAt;
            const meaningfulTime = meaningfulAt;
            window.clearTimeout(deadline);
            stopped = true;
            const measuredUntil = Math.max(acknowledgementTime, meaningfulTime);
            // Long-task entries are delivered asynchronously. This extra frame is
            // outside the measured interval and merely lets the observer flush.
            frame = requestAnimationFrame(() => {
              if (disposed) return;
              flushTimer = window.setTimeout(() => {
                if (disposed) return;
                const observerRecords = state.observer?.takeRecords() ?? [];
                state.longTasks.push(
                  ...observerRecords.map(({ duration, startTime }) => ({ duration, startTime })),
                );
                const relevantLongTasks = state.longTasks.filter(
                  (entry) =>
                    entry.startTime < measuredUntil && entry.startTime + entry.duration > startedAt,
                );
                const durations = relevantLongTasks.map((entry) => entry.duration);
                state.result = {
                  acknowledgementMs: acknowledgementTime - startedAt,
                  meaningfulMs: meaningfulTime - startedAt,
                  longTasks: {
                    supported: longTasksSupported,
                    count: durations.length,
                    totalDurationMs: durations.reduce((total, duration) => total + duration, 0),
                    maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
                  },
                };
                state.dispose?.();
              }, 0);
            });
          }

          frame = requestAnimationFrame(sampleFrame);
        }
        window.addEventListener('pointerdown', pointerDown, { capture: true, once: true });
      },
      { acknowledgement, meaningful, timeoutMs, measurementKey: MEASUREMENT_KEY },
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
      const state = target[measurementKey];
      return { result: state?.result, error: state?.error };
    }, MEASUREMENT_KEY);
    if (!state?.result)
      throw new Error(state?.error ?? 'The interaction measurement produced no result.');
    return roundSample(state.result);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const cleanup = page.evaluate((measurementKey) => {
      const target = globalThis as typeof globalThis &
        Record<string, BrowserMeasurementState | undefined>;
      target[measurementKey]?.dispose?.();
      delete target[measurementKey];
    }, MEASUREMENT_KEY);
    if (failed) await cleanup.catch(() => undefined);
    else await cleanup;
  }
}

function roundSample(sample: InteractionSample): InteractionSample {
  return {
    acknowledgementMs: round(sample.acknowledgementMs),
    meaningfulMs: round(sample.meaningfulMs),
    longTasks: {
      ...sample.longTasks,
      totalDurationMs: round(sample.longTasks.totalDurationMs),
      maxDurationMs: round(sample.longTasks.maxDurationMs),
    },
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
