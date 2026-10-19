import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Input } from '../components/ui/Field';
import { SectionCard } from '../components/ui/SectionCard';
import { buttonClassName } from '../components/ui/buttonStyles';
import { completedIsoDayLabel, DAY_MS, isoDayLabel } from '../../relay/src/insightsDay';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import type { InsightsOwner } from '../insights/envelope';
import { publishClassRecipient } from '../insights/classKey';
import { formatClassCode } from '../insights/classCode';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import type { GapsCourseConnection } from './connectionFile';
import { readClassReports, type ReadClassReports } from './readReports';
import type { DailyEvidence } from '../insights/evidence';

type Unlocked = { connection: GapsCourseConnection; owner: InsightsOwner };

export function TeacherClassReports({
  course,
  onClose,
}: {
  course: ConnectedGapsCourse;
  onClose(): void;
}) {
  const [connectionPhrase, setConnectionPhrase] = useState(''),
    [keyPhrase, setKeyPhrase] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [day, setDay] = useState(() => completedIsoDayLabel(Date.now()));
  const [invitation, setInvitation] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [result, setResult] = useState<ReadClassReports | null>(null);
  const [selected, setSelected] = useState('');
  const unlocked = useRef<Unlocked | null>(null),
    request = useRef<AbortController | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
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
      if (!owner) throw new Error('Set up or restore this course’s teacher key first.');
      controller.signal.throwIfAborted();
      unlocked.current = { connection, owner };
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
      setInvitation(formatClassCode({ shareId: course.shareId, keyId: owner.recipient.keyId }));
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
          <p className="text-sm text-ink-soft">Class workspace</p>
          <h2 id="class-reports-heading" className="break-words font-display text-2xl">
            {course.courseName}
          </h2>
        </div>
        <button type="button" className={buttonClassName('ghost')} onClick={close}>
          Close and lock
        </button>
      </div>
      {!isUnlocked ? (
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => void unlock(event)}
          aria-label="Unlock class"
        >
          <p className="text-sm text-ink-soft">
            Unlock the saved course connection and teacher key. Passphrases and decrypted results
            stay in this panel’s memory until you close it.
          </p>
          <fieldset disabled={busy} className="space-y-4">
            <Field label="Connection passphrase">
              <Input
                type="password"
                autoComplete="off"
                required
                value={connectionPhrase}
                onChange={(event) => setConnectionPhrase(event.target.value)}
              />
            </Field>
            <Field label="Teacher-key passphrase">
              <Input
                type="password"
                autoComplete="off"
                required
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
        <div className="mt-5 space-y-6">
          <section className="space-y-3" aria-labelledby="invitation-heading">
            <h3 id="invitation-heading" className="font-display text-xl">
              Invite your pupils
            </h3>
            <p className="text-sm text-ink-soft">
              Publish the public encryption key, then give this class code or link directly to your
              pupils. They enter it under Import → Lacuna course, import the course and choose
              whether to share results. Keep your connection and recovery files private.
            </p>
            <button
              type="button"
              disabled={busy}
              className={buttonClassName('secondary')}
              onClick={() => void publish()}
            >
              Publish class code
            </button>
            {invitation && (
              <>
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
                    className={buttonClassName('secondary', 'sm')}
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
          <section
            className="space-y-4 border-t border-ink/10 pt-5"
            aria-labelledby="daily-results-heading"
          >
            <h3 id="daily-results-heading" className="font-display text-xl">
              Daily results
            </h3>
            <p className="text-sm text-ink-soft">
              Reports arrive for the latest completed UTC day while pupils have Lacuna open and
              online. Trial-enabled pupil builds are required. Missing reports do not mean no study.
              Reports expire after 12 weeks.
            </p>
            <p className="text-sm text-ink-soft">
              Identifiers are chosen by pupils and specific to a device. Anyone with the class code
              can submit fabricated results. These are study signals, not verified attainment or
              attendance.
            </p>
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
                {busy ? 'Working…' : 'Read reports'}
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
                  <p role="status">No readable reports received for {day}.</p>
                ) : (
                  <>
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
                              Device {report.pupil.id.slice(0, 8)} · {report.events.length} recorded
                              activities
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
          </section>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-negative">
          {error}
        </p>
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
            <p className="break-all text-xs text-ink-soft">
              Item: {event.itemId}
              {event.conceptIds.length > 0 ? ` · Concepts: ${event.conceptIds.join(', ')}` : ''}
            </p>
          </div>
        </details>
      ))}
    </section>
  );
}
