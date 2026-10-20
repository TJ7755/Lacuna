import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { completedIsoDayLabel, DAY_MS, isoDayLabel } from '../../relay/src/insightsDay';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import { publishClassRecipient } from '../insights/classKey';
import { formatClassCode } from '../insights/classCode';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import { TeacherJourney } from './TeacherHomeView';
import { readClassReports, type ReadClassReports } from './readReports';
import type { DailyEvidence } from '../insights/evidence';
import type { ClassSession } from './classSessions';

export function TeacherClassReports({
  course,
  onClose,
  onPrepareKey,
  initialTask = 'results',
  session = null,
  beginUnlock,
  onLock,
}: {
  course: ConnectedGapsCourse;
  onClose(): void;
  onPrepareKey?(): void;
  initialTask?: 'results' | 'invite';
  session?: ClassSession | null;
  beginUnlock?(): (session: ClassSession) => boolean;
  onLock?(): void;
}) {
  const [connectionPhrase, setConnectionPhrase] = useState(''),
    [keyPhrase, setKeyPhrase] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [day, setDay] = useState(() => completedIsoDayLabel(Date.now()));
  const [invitation, setInvitation] = useState(session?.code ?? '');
  const [copyMessage, setCopyMessage] = useState('');
  const [result, setResult] = useState<ReadClassReports | null>(session?.days.get(day) ?? null);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'results' | 'invite'>(initialTask);
  const unlocked = useRef<ClassSession | null>(session),
    request = useRef<AbortController | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(session !== null);
  useEffect(
    () => () => {
      request.current?.abort();
      unlocked.current = null;
    },
    [],
  );

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const retain = beginUnlock?.();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    const connections = createGapsConnectionStore(),
      keys = createInsightsOwnerStore();
    try {
      const connection = await connections.unlock(course.shareId, connectionPhrase);
      const owner = await keys.unlock(course.shareId, keyPhrase);
      if (!connection) throw new Error('This course connection was removed. Connect it again.');
      if (!owner)
        throw new Error(
          'This browser cannot open the class yet. Set up this class, or restore its recovery file.',
        );
      controller.signal.throwIfAborted();
      const next = { connection, owner, days: new Map<string, ReadClassReports>() };
      if (retain && !retain(next)) return;
      unlocked.current = next;
      setIsUnlocked(true);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not unlock this course. Check both passphrases.',
        );
    } finally {
      connections.close();
      keys.close();
      setConnectionPhrase('');
      setKeyPhrase('');
      setBusy(false);
    }
  }

  async function publish() {
    if (!unlocked.current || busy) return;
    const { connection, owner } = unlocked.current,
      controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await publishClassRecipient({
        ...connection,
        recipient: owner.recipient,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      const code = formatClassCode({ shareId: course.shareId, keyId: owner.recipient.keyId });
      if (unlocked.current) unlocked.current.code = code;
      setInvitation(code);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not publish the class code.');
    } finally {
      setBusy(false);
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    if (!unlocked.current || busy) return;
    const { connection, owner } = unlocked.current,
      controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setResult(null);
    setSelected('');
    try {
      const loaded = await readClassReports({
        ...connection,
        owner,
        isoDay: day,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      unlocked.current?.days.set(day, loaded);
      setResult(loaded);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not read the reports.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    request.current?.abort();
    unlocked.current = null;
    onLock?.();
    onClose();
  }

  function leave() {
    request.current?.abort();
    unlocked.current = null;
    onClose();
  }

  async function copyInvitation(link: boolean) {
    try {
      await navigator.clipboard.writeText(
        link ? `https://getlacuna.app/#/s/${invitation}` : invitation,
      );
      setCopyMessage(link ? 'Join link copied.' : 'Class code copied.');
    } catch {
      setCopyMessage('Select the field and copy it manually.');
    }
  }

  return (
    <SectionCard aria-labelledby="class-reports-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            tabIndex={-1}
            id="class-reports-heading"
            className="break-words font-display text-2xl"
          >
            {course.courseName}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClassName('ghost')} onClick={leave}>
            Back to classes
          </button>
          <button type="button" className={buttonClassName('ghost')} onClick={close}>
            Close and lock
          </button>
        </div>
      </div>
      <div className="mt-6">
        <TeacherJourney
          disabled={busy}
          current={isUnlocked && view === 'results' ? 3 : 2}
          onSelect={isUnlocked ? (step) => setView(step === 2 ? 'invite' : 'results') : undefined}
        />
      </div>
      {!isUnlocked ? (
        <form
          className="teacher-task mt-5 space-y-4"
          onSubmit={(event) => void unlock(event)}
          aria-label="Unlock class"
        >
          <h3 className="font-display text-xl">Open your class securely</h3>
          <p className="text-sm text-ink-soft">
            Enter the two passphrases you set when connecting and protecting this class. Closing the
            class clears unlocked access and the reports shown here.
          </p>
          {onPrepareKey && !error && (
            <details className="text-sm text-ink-soft">
              <summary>First time here, or missing your saved key?</summary>
              <p className="mt-3">
                Set up this class before sharing its code. If you have used it before, restore its
                recovery file instead of creating a new key.
              </p>
              <button
                type="button"
                disabled={busy}
                className={`${buttonClassName('secondary')} mt-3`}
                onClick={onPrepareKey}
              >
                Set up or restore this class
              </button>
            </details>
          )}
          <fieldset disabled={busy} className="space-y-4">
            <Field
              label="Connection passphrase"
              hint="The passphrase for the connection file exported from Lacuna’s Share page."
            >
              <Input
                type="password"
                autoComplete="off"
                required
                aria-label="Connection passphrase"
                value={connectionPhrase}
                onChange={(event) => setConnectionPhrase(event.target.value)}
              />
            </Field>
            <Field
              label="Recovery passphrase"
              hint="The separate passphrase you chose when protecting this class’s reports."
            >
              <Input
                type="password"
                autoComplete="off"
                required
                aria-label="Recovery passphrase"
                value={keyPhrase}
                onChange={(event) => setKeyPhrase(event.target.value)}
              />
            </Field>
            <button type="submit" className={buttonClassName('primary')}>
              {busy ? 'Unlocking…' : 'Unlock class'}
            </button>
          </fieldset>
        </form>
      ) : (
        <div className="mt-5">
          <p role="status" className="mb-4 text-sm text-positive">
            Class unlocked on this device.
          </p>
          {view === 'invite' ? (
            <section className="teacher-task space-y-3" aria-labelledby="invitation-heading">
              <h3 id="invitation-heading" className="font-display text-xl">
                Invite your pupils
              </h3>
              <p className="text-sm text-ink-soft">
                Prepare a class code, then give it or the join link directly to your pupils. They
                open Lacuna, choose Import, then Lacuna course. After importing, they choose whether
                to share results. Keep your connection and recovery files private.
              </p>
              <button
                type="button"
                disabled={busy}
                className={buttonClassName(invitation ? 'ghost' : 'primary')}
                onClick={() => void publish()}
              >
                {busy
                  ? 'Preparing class code…'
                  : invitation
                    ? 'Check class code again'
                    : 'Publish class code'}
              </button>
              {invitation && (
                <>
                  <p role="status" className="teacher-notice">
                    Class code ready. Give pupils the code or join link below.
                  </p>
                  <Field label="Class code">
                    <Input readOnly value={invitation} onFocus={(event) => event.target.select()} />
                  </Field>
                  <Field label="Pupil join link">
                    <Input
                      readOnly
                      value={`https://getlacuna.app/#/s/${invitation}`}
                      onFocus={(event) => event.target.select()}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClassName('primary', 'sm')}
                      onClick={() => void copyInvitation(false)}
                    >
                      Copy class code
                    </button>
                    <button
                      type="button"
                      className={buttonClassName('secondary', 'sm')}
                      onClick={() => void copyInvitation(true)}
                    >
                      Copy join link
                    </button>
                  </div>
                  {copyMessage && (
                    <p role="status" className="text-sm text-ink-soft">
                      {copyMessage}
                    </p>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="space-y-4" aria-labelledby="daily-results-heading">
              <h3 id="daily-results-heading" className="font-display text-xl">
                Daily results
              </h3>
              <p className="max-w-prose text-sm text-ink-soft">
                Choose a day to read the results pupils have sent. The latest completed UTC day is
                selected. Reports need pupils to open an enabled Lacuna build online; missed days
                are not backfilled.
              </p>
              <details className="text-sm text-ink-soft">
                <summary>What these results can tell you</summary>
                <p className="mt-3 max-w-2xl">
                  Names are chosen by pupils and specific to a device. Anyone with the class code
                  can submit fabricated results. Use these as study signals, not verified attainment
                  or attendance. Missing reports do not mean no study. The relay retains encrypted
                  reports for 84 days; physical deletion may lag.
                </p>
              </details>
              <form
                onSubmit={(event) => void load(event)}
                className="flex flex-wrap items-end gap-3"
                aria-label="Read daily results"
              >
                <Field label="Reporting day (UTC)">
                  <Input
                    type="date"
                    required
                    disabled={busy}
                    value={day}
                    max={completedIsoDayLabel(Date.now())}
                    min={isoDayLabel(Date.now() - 84 * DAY_MS)}
                    onChange={(event) => {
                      setDay(event.target.value);
                      setResult(null);
                      setSelected('');
                    }}
                  />
                </Field>
                <button type="submit" disabled={busy} className={buttonClassName('primary')}>
                  {busy ? 'Reading reports…' : 'Read reports'}
                </button>
              </form>
              {result && (
                <>
                  {result.unreadable > 0 && (
                    <p role="status" className="text-sm text-negative">
                      {result.unreadable} packet(s) could not be read with this key or evidence
                      format. They are excluded below.
                    </p>
                  )}
                  {result.reports.length === 0 ? (
                    <div className="teacher-notice space-y-2" role="status">
                      <p className="font-semibold">No readable reports received for {day}.</p>
                      <p className="text-sm">
                        This does not mean pupils have not studied. Check they have the class code,
                        have chosen to share results and have opened an enabled Lacuna build online
                        after that UTC day ended. Try another day or read again later.
                      </p>
                      <button
                        type="button"
                        className={buttonClassName('secondary')}
                        onClick={() => setView('invite')}
                      >
                        Share class code
                      </button>
                    </div>
                  ) : (
                    <>
                      <p role="status" className="text-sm text-ink-soft">
                        {result.reports.length} readable report(s) for {day}. Choose a report to see
                        the recorded work. Names are self-reported.
                      </p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {result.reports.map(({ slotId, report }) => (
                          <li key={slotId}>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-ink/15 p-3 text-left hover:bg-ink/5"
                              aria-pressed={selected === slotId}
                              onClick={() => setSelected(slotId)}
                            >
                              <span className="block break-words font-semibold">
                                {report.pupil.label}
                              </span>
                              <span className="block text-xs text-ink-soft">
                                Device {report.pupil.id.slice(0, 8)} · {report.events.length}{' '}
                                recorded activities
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {selected && (
                        <ReportEvidence
                          report={result.reports.find((row) => row.slotId === selected)!.report}
                        />
                      )}
                    </>
                  )}
                </>
              )}
              {!result && !busy && (
                <div className="rounded-2xl border border-line p-5 text-sm text-ink-soft">
                  Ready to check {day}. No reports have been fetched. Choose Read reports when you
                  are ready.
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {error && (
        <div className="mt-4 space-y-3">
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
          {!isUnlocked && onPrepareKey && (
            <button type="button" className={buttonClassName('secondary')} onClick={onPrepareKey}>
              Set up or restore this class
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function ReportEvidence({ report }: { report: DailyEvidence }) {
  return (
    <section
      className="space-y-3 border-t border-ink/10 pt-4"
      aria-label={`Evidence for ${report.pupil.label}`}
    >
      <h4 className="break-words font-display text-xl">
        {report.pupil.label} · {report.day}
      </h4>
      {report.omitted > 0 && (
        <p className="text-sm text-negative">
          Incomplete report: at least {report.omitted} activities omitted by the size or activity
          limit.
        </p>
      )}
      {report.events.length === 0 && (
        <p className="text-sm text-ink-soft">No recorded activity in this report.</p>
      )}
      {report.events.map((event) => (
        <details key={event.id} className="rounded-xl border border-ink/10 p-3">
          <summary className="cursor-pointer break-words">
            <span className="font-medium">{event.prompt || event.kind}</span>
            <span className="ml-2 text-sm text-ink-soft">
              {event.marking === 'recall'
                ? event.retained === null
                  ? 'Recall unknown'
                  : event.retained
                    ? 'Recalled'
                    : 'Not recalled'
                : `${event.earned ?? 'Unknown'} / ${event.available ?? 'unknown'} marks`}{' '}
              ·{' '}
              {event.marking === 'self'
                ? 'Self marked'
                : event.marking === 'automatic'
                  ? 'Automatic marking'
                  : 'Recall'}
            </span>
          </summary>
          <div className="mt-3 space-y-2 text-sm">
            <p className="whitespace-pre-wrap break-words">
              {event.answer || 'No submitted text recorded.'}
            </p>
            {event.disputed && (
              <p className="text-negative">The pupil disputed the checker’s verdict.</p>
            )}
            {event.shortened && (
              <p className="text-ink-soft">Text or criterion detail shortened for this report.</p>
            )}
            {event.criteria.length > 0 && (
              <ul className="space-y-1">
                {event.criteria.map((criterion) => (
                  <li key={criterion.id} className="break-words">
                    {criterion.label}: {criterion.earned ?? 'Unknown'} / {criterion.available}
                  </li>
                ))}
              </ul>
            )}
            <details className="text-xs text-ink-soft">
              <summary>Item details</summary>
              <p className="mt-2 break-all">
                Item: {event.itemId}
                {event.conceptIds.length > 0 ? ` · Concepts: ${event.conceptIds.join(', ')}` : ''}
              </p>
            </details>
          </div>
        </details>
      ))}
    </section>
  );
}
