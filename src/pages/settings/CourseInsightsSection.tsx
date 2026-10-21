import { useState } from 'react';
import { Toggle } from '../../components/ui/Toggle';
import { Field, Input } from '../../components/ui/Field';
import { buttonClassName } from '../../components/ui/buttonStyles';
import {
  createInsightsLastSentDaySetting,
  createInsightsOptInSetting,
} from '../../state/insightsOptIn';
import {
  createEnrolmentSetting,
  reportingEnabled,
  setReportingConsent,
} from '../../insights/enrolment';
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { SettingsCard } from './SettingsUi';

export function CourseInsightsSection({ courseId }: { courseId: string }) {
  const [enrolment] = createEnrolmentSetting(courseId).use();
  const [optedIn] = createInsightsOptInSetting(courseId).use();
  const [lastSent] = createInsightsLastSentDaySetting(courseId).use();
  const [label, setLabel] = useState(enrolment?.pupilLabel ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = reportingEnabled();
  const consenting = optedIn && enrolment?.consentedAt !== null && enrolment !== null;

  async function retry() {
    setBusy(true);
    setMessage('');
    try {
      const { deliverCourseInsights } = await import('../../insights/delivery');
      await deliverCourseInsights(courseId, { retry: true });
      setMessage('Checked yesterday’s report. Only the latest completed UTC day is sent.');
    } catch {
      setMessage('Could not deliver the report. Your encrypted packet is saved for retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard>
      <h2 className="font-semibold text-ink">Class insights</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {enrolment
          ? 'Send your teacher a daily, encrypted summary of how you are getting on.'
          : 'Join with your teacher’s Gaps class code to connect this course. Ordinary share links do not enable reporting.'}
      </p>
      {!enabled && (
        <p className="mt-2 text-sm text-ink-soft">
          Daily delivery is not enabled in this build. No results will be sent.
        </p>
      )}
      {enrolment && (
        <div className="mt-5 sm:max-w-sm">
          <Field
            label="Name or class identifier"
            hint="Use the identifier your teacher asked for. It is included in your encrypted report."
          >
            <Input
              value={label}
              maxLength={80}
              disabled={consenting}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="mt-5 flex items-start justify-between gap-4 border-t border-line pt-5">
        <div className="min-w-0">
          <label htmlFor={`insights-opt-in-${courseId}`} className="text-sm font-medium text-ink">
            Share insights with your teacher
          </label>
          <p className="mt-1 text-sm text-ink-soft">
            Your prompts, answers, marks, criterion results and card recall are encrypted so only
            your teacher can read them. They may be able to recognise you from this detail.
          </p>
          <p className="mt-1 text-sm text-ink-faint">
            {lastSent === null ? 'Nothing has been sent yet.' : `Last sent: ${lastSent}.`}
          </p>
        </div>
        <Toggle
          id={`insights-opt-in-${courseId}`}
          checked={consenting}
          disabled={!enrolment}
          onChange={(checked) => {
            try {
              setReportingConsent(courseId, checked, label);
              setMessage('');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Could not save your choice.');
            }
          }}
        />
      </div>
      {enabled && consenting && (
        <button
          type="button"
          disabled={busy}
          className={`${buttonClassName('secondary', 'sm')} mt-3`}
          onClick={() => void retry()}
        >
          {busy ? 'Checking…' : 'Send yesterday’s report'}
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {message}
        </p>
      )}
      <InlineSettingsDisclosure
        className="mt-5 border-t border-line pt-4"
        headerClassName="flex cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        header={<span className="text-sm font-medium text-ink">How sharing works</span>}
      >
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            While this app is open and online, at most one report per completed day is sent: the
            latest completed UTC day. Missed days are not sent later, and long answers or busy days
            may be shortened.
          </li>
          <li>
            The service sees the course, reporting day, submission time and packet size, but not
            your results.
          </li>
          <li>
            Your chosen identifier and a random identifier for this course on this device are inside
            the encrypted report, so another device can appear separately. This is not verified
            pupil identity.
          </li>
          <li>
            Turning it off stops future sends. Encrypted submissions expire from the relay after 12
            weeks, though physical cleanup can take longer. Your teacher may keep results they have
            already received.
          </li>
        </ul>
      </InlineSettingsDisclosure>
      <a
        href="https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-sm text-ink-soft underline"
      >
        School data notice
      </a>
    </SettingsCard>
  );
}
