import { Toggle } from '../../components/ui/Toggle';
import {
  createInsightsLastSentWeekSetting,
  createInsightsOptInSetting,
} from '../../state/insightsOptIn';
import { SettingsCard } from './SettingsUi';

export interface CourseInsightsSectionProps {
  courseId: string;
}

/** Device-local consent for distributed courses; delivery is still disconnected. */
export function CourseInsightsSection({ courseId }: CourseInsightsSectionProps) {
  const optIn = createInsightsOptInSetting(courseId);
  const lastSentWeek = createInsightsLastSentWeekSetting(courseId);
  const [optedIn, setOptedIn] = optIn.use();
  const [lastSent] = lastSentWeek.use();

  return (
    <SettingsCard>
      <h2 className="mb-1 font-display text-2xl font-semibold tracking-tight">Class insights</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Weekly delivery is not connected yet. Turning this on records your choice on this device; no
        results are sent.
      </p>
      <div className="mb-4 flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <label htmlFor="insights-opt-in" className="font-semibold text-ink">
            Share insights with your teacher
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            When delivery is available, your question results and study progress will be encrypted
            so only your teacher can read them. Your teacher may be able to recognise you from this
            detail.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            The service will see the course, week, submission time and packet size, but not your
            results.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Turning it off stops future sends. Encrypted submissions will expire from the relay
            after 12 weeks. Your teacher may keep results they have already received.
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
