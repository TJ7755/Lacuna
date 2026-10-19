import { createLocalSetting, type LocalSetting } from './localSetting';
import { ISO_WEEK_LABEL_RE } from '../insights/isoWeek';

/**
 * The class-insights opt-in and its weekly marker, stored per course on the
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

/** `lacuna.insights.lastSentWeek.<courseId>`: the last week the transport completed. */
export function createInsightsLastSentWeekSetting(courseId: string): LocalSetting<string | null> {
  return createLocalSetting<string | null>({
    key: `lacuna.insights.lastSentWeek.${courseId}`,
    event: `lacuna:insights-last-sent-week-${courseId}`,
    parse: (raw) => (raw !== null && ISO_WEEK_LABEL_RE.test(raw) ? raw : null),
    serialise: (value) => value ?? '',
  });
}
