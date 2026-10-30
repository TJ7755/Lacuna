import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { Toggle } from '../../components/ui/Toggle';
import { Field, Input } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { ConfirmInlineSwap } from '../../components/ui/ConfirmInline';
import { buttonClassName } from '../../components/ui/buttonStyles';
import {
  createInsightsLastSentDaySetting,
  createInsightsLastPublishedAtSetting,
  createInsightsOptInSetting,
} from '../../state/insightsOptIn';
import {
  createEnrolmentSetting,
  disconnectFromClass,
  reportingEnabled,
  setReportingConsent,
} from '../../insights/enrolment';
import { InlineSettingsDisclosure } from './InlineSettingsDisclosure';
import { SettingsCard } from './SettingsUi';

export function CourseInsightsSection({
  courseId,
  onDisconnected,
}: {
  courseId: string;
  onDisconnected?: () => void;
}) {
  const [enrolment] = createEnrolmentSetting(courseId).use();
  const [optedIn] = createInsightsOptInSetting(courseId).use();
  const [lastSent] = createInsightsLastSentDaySetting(courseId).use();
  const [lastPublished] = createInsightsLastPublishedAtSetting(courseId).use();
  const course = useLiveQuery(() => db.courses.get(courseId), [courseId]);
  const [label, setLabel] = useState(enrolment?.pupilLabel ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const enabled = reportingEnabled();
  const consenting = optedIn && enrolment?.consentedAt !== null && enrolment !== null;

  async function disconnect() {
    setDisconnecting(true);
    try {
      await disconnectFromClass(courseId);
      setLabel('');
      setConfirmingDisconnect(false);
      setMessage('Disconnected from Gaps. Your course and study history are kept.');
      onDisconnected?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not disconnect from Gaps.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function publish() {
    setBusy(true);
    setMessage('');
    try {
      if (!navigator.onLine) {
        setMessage('You are offline. Connect to the internet and send again.');
        return;
      }
      const { publishCourseInsights } = await import('../../insights/delivery');
      const result = await publishCourseInsights(courseId);
      setMessage(
        result === 'sent'
          ? 'Your latest progress was accepted. Your teacher can refresh the class view to read it.'
          : result === 'unchanged'
            ? 'Nothing new to send. Your latest progress is already published.'
            : 'Nothing was sent. Check sharing is enabled and this course is still connected.',
      );
    } catch {
      setMessage(
        navigator.onLine
          ? 'Could not send your latest progress. Try again.'
          : 'You are offline. Connect to the internet and send again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard>
      <h2 className="font-semibold text-ink">Class insights</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {enrolment
          ? 'Send your teacher an encrypted summary of your latest progress.'
          : 'Join with your teacher’s Gaps class code to connect this course. Ordinary share links do not enable reporting.'}
      </p>
      {!enabled && (
        <p className="mt-2 text-sm text-ink-soft">
          Insights delivery is not enabled in this build. No results will be sent.
        </p>
      )}
      {enrolment && (
        <p className="mt-2 text-sm text-ink-soft">
          Connected course: {course?.name ?? 'Loading course…'}.
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
            your teacher can read them. They may be able to recognise you from this detail. Reports
            include activity already recorded today and yesterday.
          </p>
          <p className="mt-1 text-sm text-ink-faint">
            {lastPublished !== null
              ? `Last successful publication: ${new Date(lastPublished).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC.`
              : lastSent === null
                ? 'Nothing has been sent yet.'
                : `Last daily report: ${lastSent}.`}
          </p>
        </div>
        <Toggle
          id={`insights-opt-in-${courseId}`}
          checked={consenting}
          disabled={!enrolment || disconnecting}
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
          disabled={busy || disconnecting}
          className={`${buttonClassName('secondary', 'sm')} mt-3`}
          onClick={() => void publish()}
        >
          {busy ? 'Sending…' : 'Send latest progress'}
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {message}
        </p>
      )}
      <InlineSettingsDisclosure
        className="mt-5 border-t border-line pt-4"
        headerClassName="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        header={<span className="text-sm font-medium text-ink">How sharing works</span>}
      >
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          <li>
            Send latest progress publishes today’s completed work immediately. Send again after more
            work to update the same daily report, without counting it twice. While this app is open
            and online, yesterday’s report is also sent automatically. Days use UTC; missed days are
            not sent later, and long answers or busy days may be shortened.
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
      {enrolment && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-medium text-ink">Disconnect from Gaps</h3>
          <p className="mt-1 mb-3 text-sm text-ink-soft">
            Stop sharing with this teacher and remove this course from Gaps on this device. Your
            course, lessons and study history stay in Lacuna.
          </p>
          <ConfirmInlineSwap
            active={confirmingDisconnect}
            message="Disconnect from Gaps on this device? Your course and study history stay in Lacuna. Results your teacher has already received are kept."
            confirmLabel="Disconnect"
            variant="default"
            onConfirm={disconnect}
            onCancel={() => setConfirmingDisconnect(false)}
          >
            <Button variant="secondary" size="sm" onClick={() => setConfirmingDisconnect(true)}>
              Disconnect from Gaps
            </Button>
          </ConfirmInlineSwap>
        </div>
      )}
    </SettingsCard>
  );
}
