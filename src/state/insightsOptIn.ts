import { createLocalSetting, type LocalSetting } from './localSetting';
import { isoDayStartMs } from '../../relay/shared/insights/index';

/**
 * The class-insights opt-in and its daily marker, stored per course on the
 * device only (issue #591). Both ride the shared device-local preference
 * machinery: a localStorage value under `lacuna.` keys and cross-tab events on
 * the `lacuna:` convention. Nothing here is part of the synced course payload,
 * so consent and send markers never move between devices without the student's
 * own action. Turning the switch off stops future sends immediately; what was
 * already sent keeps expiring on the relay under the shared retention window.
 */

/** `lacuna.insights.optIn.<courseId>`: the per-course sending choice. */
export function createInsightsOptInSetting(courseId: string): LocalSetting<boolean> {
  return createLocalSetting<boolean>({
    key: `lacuna.insights.optIn.${courseId}`,
    event: `lacuna:insights-opt-in-${courseId}`,
    parse: (raw) => raw === 'on',
    serialise: (value) => (value ? 'on' : 'off'),
  });
}

/** `lacuna.insights.lastSentDay.<courseId>`: the last day the transport completed. */
export function createInsightsLastSentDaySetting(courseId: string): LocalSetting<string | null> {
  return createLocalSetting<string | null>({
    key: `lacuna.insights.lastSentDay.${courseId}`,
    event: `lacuna:insights-last-sent-day-${courseId}`,
    parse: (raw) => {
      try {
        if (raw !== null) {
          isoDayStartMs(raw);
          return raw;
        }
      } catch {
        /* A corrupt or old weekly marker is not a daily acknowledgement. */
      }
      return null;
    },
    serialise: (value) => value ?? '',
  });
}

/** Device-local acknowledgement time for explicit current-progress publication. */
export function createInsightsLastPublishedAtSetting(
  courseId: string,
): LocalSetting<number | null> {
  return createLocalSetting<number | null>({
    key: `lacuna.insights.lastPublishedAt.${courseId}`,
    event: `lacuna:insights-last-published-at-${courseId}`,
    parse: (raw) => {
      const value = raw === null || raw === '' ? NaN : Number(raw);
      return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
        ? value
        : null;
    },
    serialise: (value) => (value === null ? '' : String(value)),
  });
}
