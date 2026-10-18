import { Toggle } from '../../components/ui/Toggle';
import {
  createInsightsLastSentWeekSetting,
  createInsightsOptInSetting,
} from '../../state/insightsOptIn';
import { SettingsCard } from './SettingsUi';

export interface CourseInsightsSectionProps {
  courseId: string;
}

/**
 * The class-insights opt-in for a student's course shared from a teacher's
 * published lineage (issue #591). Off by default, per course, per device; the
 * toggle commits instantly like its settings-page siblings, and no command
 * exists to prompt again later: consent is recorded purely by this toggle.
 *
 * Copy follows the #600 re-scope: the device's raw study detail is sealed
 * end-to-end so only the course owner can read it, the service transports
 * ciphertext plus participation signals, and turning the toggle off stops
 * future sends immediately. What has already been sent expires by retention
 * and - being ciphertext to the owner's key - cannot be deleted one item at a
 * time, which the disclosure says plainly rather than implying otherwise.
 *
 * Rendered only when `course.distributedCopy` is present (CourseSettings.tsx).
 */
export function CourseInsightsSection({ courseId }: CourseInsightsSectionProps) {
  const optIn = createInsightsOptInSetting(courseId);
  const lastSentWeek = createInsightsLastSentWeekSetting(courseId);
  const [optedIn, setOptedIn] = optIn.use();
  const [lastSent] = lastSentWeek.use();

  return (
    <SettingsCard>
      <h2 className="mb-1 font-display text-2xl font-semibold tracking-tight">Class insights</h2>
      <p className="mb-4 text-sm text-ink-soft">
        This course was shared by its author. When weekly insights are on, your device sends them
        one anonymous summary per completed week.
      </p>
      <div className="mb-4 flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <label htmlFor="insights-opt-in" className="font-semibold text-ink">
            Share insights with your teacher
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            Your study detail is sealed end-to-end, so only your teacher can read it. The service
            that carries it never sees your answers, and nothing in the weekly summary identifies
            you.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Turning it off stops future sends. What has already been sent expires after a fixed
            period and cannot be deleted one item at a time.
          </p>
        </div>
        <Toggle
          id="insights-opt-in"
          checked={optedIn}
          onChange={(checked) => setOptedIn(checked)}
        />
      </div>
      <p className="text-sm text-ink-soft">
        {lastSent === null ? 'Nothing has been sent yet.' : `Last sent: ${lastSent}.`}
      </p>
    </SettingsCard>
  );
}
