import { useId, useLayoutEffect, useRef, useState } from 'react';
import { AppLink } from '../../components/ui/AppLink';
import { Toggle } from '../../components/ui/Toggle';
import { Field, Input, fieldLabelClassName } from '../../components/ui/Field';
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

const OFFLINE_MESSAGE = 'You are offline. Connect to the internet and send again.';

export function CourseInsightsSection({
  courseId,
  heading = 'Gaps',
  focusOnJoin = false,
  onDisconnected,
}: {
  courseId: string;
  heading?: string | false;
  focusOnJoin?: boolean;
  onDisconnected?: () => void;
}) {
  const enrolmentSetting = createEnrolmentSetting(courseId);
  const optInSetting = createInsightsOptInSetting(courseId);
  const [enrolment] = enrolmentSetting.use();
  const [optedIn] = optInSetting.use();
  const [lastSent] = createInsightsLastSentDaySetting(courseId).use();
  const [lastPublished] = createInsightsLastPublishedAtSetting(courseId).use();
  const [draft, setDraft] = useState<string>();
  const [identifierError, setIdentifierError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [sendFeedback, setSendFeedback] = useState<{ consent: string; message: string }>();
  const [sending, setSending] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const switchId = useId();
  const consentDescriptionId = useId();
  const enabled = reportingEnabled();
  const consenting = optedIn && enrolment !== null && enrolment.consentedAt !== null;
  const consent = consenting ? JSON.stringify(enrolment) : null;
  const label = draft ?? enrolment?.pupilLabel ?? '';
  const disconnectedHere = disconnected && !enrolment && !onDisconnected;
  const lastReport =
    lastPublished !== null
      ? `Last manual send: ${new Date(lastPublished).toLocaleString('en-GB')}.`
      : lastSent !== null
        ? `Last automatic report: ${lastSent}.`
        : 'Nothing has been sent yet.';

  useLayoutEffect(() => {
    if ((disconnectedHere || focusOnJoin) && document.activeElement === document.body) {
      headingRef.current?.focus();
    }
  }, [disconnectedHere, focusOnJoin]);

  function changeConsent(checked: boolean) {
    setConsentError('');
    setSendFeedback(undefined);
    if (checked && (!label.trim() || label.trim().length > 80)) {
      setIdentifierError('Enter a name or class identifier (up to 80 characters).');
      identifierRef.current?.focus();
      return;
    }
    try {
      setReportingConsent(courseId, checked, label);
      setDraft(undefined);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : 'Could not save your choice.');
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError('');
    setSendFeedback(undefined);
    try {
      await disconnectFromClass(courseId);
      setDraft(undefined);
      setIdentifierError('');
      setConsentError('');
      setConfirmingDisconnect(false);
      setDisconnected(true);
      onDisconnected?.();
    } catch (error) {
      setDisconnectError(
        error instanceof Error ? error.message : 'Could not disconnect from Gaps.',
      );
    } finally {
      setDisconnecting(false);
    }
  }

  async function publish() {
    if (!consent || inFlight.current || disconnecting) return;
    inFlight.current = true;
    setSending(true);
    setSendFeedback({ consent, message: 'Sending…' });

    // Once consent changes, this attempt's feedback is stale even if sharing is turned back on.
    let current = true;
    const checkConsent = () => {
      current &&= optInSetting.read() && JSON.stringify(enrolmentSetting.read()) === consent;
    };
    const unsubscribeEnrolment = enrolmentSetting.subscribe(checkConsent);
    const unsubscribeOptIn = optInSetting.subscribe(checkConsent);
    const report = (message: string) => {
      checkConsent();
      if (current) setSendFeedback({ consent, message });
    };
    try {
      if (!navigator.onLine) {
        report(OFFLINE_MESSAGE);
        return;
      }
      const { publishCourseInsights } = await import('../../insights/delivery');
      checkConsent();
      if (!current) return;
      const result = await publishCourseInsights(courseId);
      report(
        result === 'sent'
          ? 'Progress sent. Your teacher can refresh Gaps to read it.'
          : result === 'unchanged'
            ? 'Your latest progress has already been sent.'
            : 'Nothing was sent. Check that sharing is on and the class is still connected.',
      );
    } catch {
      report(navigator.onLine ? 'Could not send progress. Try again.' : OFFLINE_MESSAGE);
    } finally {
      unsubscribeEnrolment();
      unsubscribeOptIn();
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <SettingsCard>
      <div role="region" aria-labelledby={headingId} className="max-w-2xl">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={heading ? 'mb-4 font-semibold text-ink' : 'sr-only'}
        >
          {heading || 'Progress sharing'}
        </h2>
        <p
          role="status"
          aria-label="Class connection"
          className={disconnectedHere ? 'mb-3 text-sm text-ink-soft' : undefined}
        >
          {disconnectedHere && 'Disconnected from Gaps. Your course and study history are kept.'}
        </p>
        {enrolment ? (
          <>
            {consenting ? (
              <dl className="mb-5">
                <dt className={fieldLabelClassName}>Name or class identifier</dt>
                <dd className="mt-1 break-words text-sm text-ink-soft">{enrolment.pupilLabel}</dd>
              </dl>
            ) : (
              <Field
                label="Name or class identifier"
                hint="Use the identifier your teacher asked for. It is included in your report."
                error={identifierError}
                className="mb-5 max-w-sm"
              >
                <Input
                  ref={identifierRef}
                  value={label}
                  maxLength={80}
                  disabled={disconnecting}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setIdentifierError('');
                  }}
                />
              </Field>
            )}
            {!enabled && (
              <p className="mb-2 text-sm text-ink-soft">This build cannot send reports.</p>
            )}
            <div className="flex w-fit items-center gap-4">
              <label htmlFor={switchId} className="text-sm font-semibold text-ink">
                Share insights with your teacher
              </label>
              <Toggle
                id={switchId}
                descriptionId={consenting ? undefined : consentDescriptionId}
                checked={consenting}
                disabled={disconnecting}
                onChange={changeConsent}
              />
            </div>
            {!consenting && (
              <p id={consentDescriptionId} className="mt-2 max-w-prose text-sm text-ink-soft">
                Your teacher can read encrypted reports of your answers, marks and study progress.
                Yesterday’s report sends while Lacuna is open and online. Your teacher may keep
                reports. Turning sharing off stops future sends from this device.
              </p>
            )}
            {consentError && (
              <p role="alert" className="mt-2 text-sm text-negative">
                {consentError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              {enabled && consenting && (
                <Button
                  type="button"
                  size="sm"
                  aria-disabled={sending || disconnecting}
                  className="aria-disabled:opacity-60"
                  onClick={() => void publish()}
                >
                  Send latest progress
                </Button>
              )}
              <div className="text-sm text-ink-soft">
                <p>{lastReport}</p>
                <p role="status" aria-atomic="true">
                  {consent && sendFeedback?.consent === consent && sendFeedback.message}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="max-w-prose text-sm text-ink-soft">
              Use your teacher’s Gaps class code to connect this course. Ordinary share links are
              for course content.
            </p>
            <AppLink to="/?import=1&join=1" className={buttonClassName('secondary', 'sm')}>
              Join a class
            </AppLink>
          </div>
        )}

        <InlineSettingsDisclosure
          className="mt-5 border-t border-line pt-4"
          headerClassName="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          header={<span className="text-sm font-medium text-ink">How sharing works</span>}
        >
          <ul className="mt-3 max-w-prose list-disc space-y-2 pl-5 text-sm text-ink-soft">
            <li>
              Only your teacher can read the encrypted prompts, answers, marks, criterion results
              and card recall. Your teacher may recognise you from this detail. Reports include
              activity already recorded today and yesterday.
            </li>
            <li>
              Send latest progress shares today’s completed work. Send again after more work to
              update the same report. Yesterday’s report is sent automatically while Lacuna is open
              and online. Days follow this device’s time zone. Lacuna skips missed days and may
              shorten long answers or reports from busy days.
            </li>
            <li>The service can see the course, reporting day, submission time and packet size.</li>
            <li>
              Reports include your chosen identifier and a random identifier for this course on this
              device. Your teacher may see separate entries for different devices. Lacuna does not
              verify pupil identity.
            </li>
            <li>
              Turning sharing off stops future reports from this device. Encrypted submissions
              expire from the relay after 12 weeks. Physical cleanup can take longer. Your teacher
              may keep results they have already received.
            </li>
          </ul>
        </InlineSettingsDisclosure>
        <a
          href="https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-sm text-ink-soft underline"
        >
          School data notice
        </a>
        {enrolment && (
          <div className="mt-4 border-t border-line pt-5">
            <ConfirmInlineSwap
              active={confirmingDisconnect}
              message="Stop sharing and remove this Gaps connection from this device? Your course, lessons and study history stay in Lacuna. Results your teacher has already received are kept."
              confirmLabel={disconnecting ? 'Disconnecting…' : 'Disconnect'}
              variant="default"
              focusOnMount="cancel"
              keepFocusWhilePending
              onConfirm={disconnect}
              onCancel={() => {
                setConfirmingDisconnect(false);
                setDisconnectError('');
              }}
            >
              <Button type="button" size="sm" onClick={() => setConfirmingDisconnect(true)}>
                Disconnect from Gaps
              </Button>
            </ConfirmInlineSwap>
            {disconnectError && (
              <p role="alert" className="mt-2 text-sm text-negative">
                {disconnectError}
              </p>
            )}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

/** The course route can still be loading after the initiating page has unmounted. */
export function focusCourseHeading(pathname: string) {
  const previousFocus = document.activeElement;
  const previousPage = document.querySelector('[data-route-content]:not([inert])');
  const observer = new MutationObserver(focusHeading);
  let frame = 0;
  const timeout = window.setTimeout(stop, 10_000);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(frame);
  }
  function focusHeading() {
    window.cancelAnimationFrame(frame);
    const page = document.querySelector('[data-route-content]:not([inert])');
    if (page && page !== previousPage && page.getAttribute('data-route-content') !== pathname) {
      stop();
      return;
    }
    const heading = document.querySelector<HTMLElement>(
      `[data-route-content="${CSS.escape(pathname)}"]:not([inert]) h1`,
    );
    if (!heading || heading.closest('[inert]')) return;
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== previousFocus &&
      !active.closest('[inert]')
    ) {
      stop();
      return;
    }
    heading.tabIndex = -1;
    heading.focus();
    if (document.activeElement === heading) stop();
    else frame = window.requestAnimationFrame(focusHeading);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  focusHeading();
}
