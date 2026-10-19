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
      <h2 className="mb-1 font-display text-2xl font-semibold tracking-tight">Class insights</h2>
      {!enrolment && (
        <p className="mb-4 text-sm text-ink-soft">
          Join using your teacher’s Gaps class code to connect this course. Ordinary share links do
          not enable reporting.
        </p>
      )}
      {!enabled && (
        <p className="mb-4 text-sm text-ink-soft">
          Daily delivery is not enabled in this build. No results will be sent.
        </p>
      )}
      <div className="mb-4 space-y-2 text-sm text-ink-soft">
        <p>
          Your question prompts, submitted answers, recorded marks, criterion results and card
          recall will be encrypted so only your teacher can read them. Your teacher may be able to
          recognise you from this detail.
        </p>
        <p>
          While this app is open and online, at most one report per completed day is sent: the
          latest completed UTC day, including activity already recorded yesterday. Missed days are
          not sent later. Long answers and busy days may be shortened.
        </p>
        <p>
          The service sees the course, reporting day, submission time and packet size, but not your
          results.
        </p>
        <p>
          Turning it off stops future sends. Encrypted submissions expire from the relay after 12
          weeks; physical cleanup can take longer. Your teacher may keep results they have already
          received.
        </p>
        <p>
          Your chosen identifier and a random identifier for this course on this device are included
          inside the encrypted report. Another device can appear separately. This is not verified
          pupil identity.
        </p>
      </div>
      {enrolment && (
        <div className="mb-4">
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <label htmlFor={`insights-opt-in-${courseId}`} className="font-semibold text-ink">
          Share insights with your teacher
        </label>
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
      <p className="text-sm text-ink-soft">
        {lastSent === null ? 'Nothing has been sent yet.' : `Last sent: ${lastSent}.`}
      </p>
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
    </SettingsCard>
  );
}
