import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { PAGE_FRAME } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { Field, Input } from '../components/ui/Field';
import { ArrowRightIcon, ClockIcon, UnlockIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { ShareLinkError } from '../shareLinks/client';
import {
  dayLabel,
  itemsToRevisit,
  mean,
  percent,
  pupilScore,
  summariseItems,
} from './classInsights';
import {
  GAPS_CONNECTION_FILE_MAX_BYTES,
  GapsConnectionFileError,
  parseGapsConnectionFile,
} from './connectionFile';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import { BandDot, ExpandingAction, focusFirstField, ScoreBar, Spinner } from './gapsUi';
import type { ClassSession } from './StandaloneTeacherHome';

/** The study app's dashboard, for classes: one line of numbers, then the rows to act on. */
export function TodayPage({
  courses,
  sessions,
  day,
  connectRequest,
  onOpen,
  onConnected,
}: {
  courses: ConnectedGapsCourse[];
  sessions: ReadonlyMap<string, ClassSession>;
  day: string;
  /** Each new non-zero value opens the connection form, as the sidebar's shortcut asks. */
  connectRequest: number;
  onOpen(course: ConnectedGapsCourse): void;
  onConnected(course: ConnectedGapsCourse): void;
}) {
  const [connecting, setConnecting] = useState(false);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connectRequest) return;
    // With no classes the form is already open on the page.
    if (first.current) focusFirstField(first.current);
    else setConnecting(true);
  }, [connectRequest]);

  const open = courses.flatMap((course) => {
    const latest = sessions.get(course.shareId)?.days.get(day);
    if (!latest) return [];
    const reports = latest.reports.map(({ report }) => report);
    return [
      {
        course,
        reports: reports.length,
        revisit: itemsToRevisit(summariseItems(reports), Infinity).length,
        score: mean(reports.map(pupilScore)),
      },
    ];
  });
  // The first locked class is the default next step; an open class needs no nudge.
  const lead = courses.find((course) => !sessions.has(course.shareId));

  return (
    <div className={`${PAGE_FRAME} pb-24 pt-8 md:pt-12`}>
      <h1 tabIndex={-1} data-page-title className="sr-only">
        Today
      </h1>
      <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-ink-soft">
        <span className="inline-flex items-baseline gap-2">
          <strong className="font-display text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {courses.length}
          </strong>
          {courses.length === 1 ? 'class' : 'classes'}
        </span>
        <span className="inline-flex items-center gap-2">
          <ClockIcon width={20} height={20} className="max-sm:hidden" />
          {dayLabel(day)}
        </span>
        {courses.length > 0 && (
          <ExpandingAction
            label="Connect a class"
            open={connecting}
            onOpenChange={setConnecting}
            className="ml-auto"
          >
            <ConnectClassForm onConnected={onConnected} />
          </ExpandingAction>
        )}
      </div>

      {courses.length === 0 ? (
        <SectionCard className="gaps-rise flex flex-col items-center px-6 py-16 text-center md:py-20">
          <StudyDrawing kind="course" className="mb-6 h-24 w-24" />
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Connect your first class
          </h2>
          <p className="mt-3 max-w-sm text-ink-soft">
            Bring the connection file from your course’s Share page in Lacuna.
          </p>
          <div ref={first} className="mt-10 w-full max-w-sm text-left">
            <ConnectClassForm onConnected={onConnected} />
          </div>
          <a href="https://getlacuna.app/#/share" className={`${buttonClassName('ghost')} mt-4`}>
            Open Share in Lacuna
          </a>
        </SectionCard>
      ) : (
        <>
          {open.length > 0 && (
            <SectionCard className="gaps-rise mb-8 p-6 md:p-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight">Yesterday</h2>
              <ul className="mt-6 flex flex-col gap-5">
                {open.map((row, index) => (
                  <li key={row.course.shareId}>
                    <div className="mb-2.5 flex items-baseline justify-between gap-4 text-sm">
                      <span className="truncate font-semibold">{row.course.courseName}</span>
                      <span className="shrink-0 tabular-nums text-ink-soft">
                        {percent(row.score)} secure
                      </span>
                    </div>
                    <ScoreBar score={row.score} index={index} className="h-2" />
                  </li>
                ))}
              </ul>
              <div className="mt-8 grid grid-cols-3 gap-6 border-t border-line pt-6">
                <Stat value={open.reduce((sum, row) => sum + row.reports, 0)} label="reports" />
                <Stat value={open.reduce((sum, row) => sum + row.revisit, 0)} label="to revisit" />
                <Stat value={percent(mean(open.map((row) => row.score)))} label="secure" />
              </div>
            </SectionCard>
          )}
          <ul aria-label="Your classes" className="flex flex-col gap-3">
            {courses.map((course, index) => {
              const session = sessions.get(course.shareId);
              const summary = open.find((row) => row.course === course);
              const action = session ? 'Open' : 'Unlock';
              return (
                <li
                  key={course.shareId}
                  style={{ '--i': index } as CSSProperties}
                  className="gaps-rise gaps-lift flex items-center gap-4 rounded-[20px] bg-surface py-3.5 pl-5 pr-3.5 card-surface card-surface-control hover:bg-surface-raised sm:gap-5 sm:pl-6"
                >
                  {summary ? (
                    <BandDot score={summary.score} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${session ? 'bg-accent' : 'bg-ink-faint/60'}`}
                    />
                  )}
                  <h2 className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpen(course)}
                      className="flex min-h-11 w-full items-center text-left font-display text-lg font-semibold leading-tight tracking-tight hover:underline hover:decoration-2 hover:underline-offset-4 sm:text-xl"
                    >
                      <span className="line-clamp-2 break-words">{course.courseName}</span>
                    </button>
                  </h2>
                  <span className="text-sm text-ink-faint max-sm:hidden">
                    {summary
                      ? `${summary.reports} reports · ${summary.revisit} to revisit`
                      : session
                        ? 'Unlocked'
                        : 'Locked'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpen(course)}
                    aria-label={`${action} ${course.courseName}`}
                    className={`${buttonClassName(course === lead ? 'primary' : 'secondary')} gaps-press`}
                  >
                    {!session && <UnlockIcon width={18} height={18} />}
                    {action}
                    {session && <ArrowRightIcon width={18} height={18} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <strong className="block font-display text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </strong>
      <span className="text-sm text-ink-soft">{label}</span>
    </div>
  );
}

/** Verifies ownership with the relay before saving; the passphrase never leaves the device. */
export function ConnectClassForm({
  onConnected,
}: {
  onConnected(course: ConnectedGapsCourse): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!file || file.size > GAPS_CONNECTION_FILE_MAX_BYTES) {
      setError('Choose a Gaps connection file smaller than 8 KiB.');
      setAttempt((value) => value + 1);
      return;
    }
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    const store = createGapsConnectionStore();
    try {
      const text = await file.text();
      await store.connect(text, phrase, { signal: request.signal });
      const shareId = parseGapsConnectionFile(text).shareId;
      const connected = (await store.list()).find((course) => course.shareId === shareId);
      if (connected) onConnected(connected);
    } catch (cause) {
      setAttempt((value) => value + 1);
      setError(
        request.signal.aborted
          ? 'Connection cancelled.'
          : cause instanceof ShareLinkError
            ? cause.status === 401
              ? 'This file does not own the course. Export a fresh connection from the device that published it.'
              : cause.status === 404 || cause.status === 410
                ? 'This share link is missing or expired. Publish it again in Lacuna, then export a new connection.'
                : 'Could not verify course ownership with the relay. Try again later.'
            : cause instanceof GapsConnectionFileError
              ? cause.message
              : 'Could not open the connection. Check the file and passphrase.',
      );
    } finally {
      store.close();
      setPhrase('');
      setBusy(false);
      controller.current = null;
    }
  }

  return (
    <form
      onSubmit={(event) => void connect(event)}
      aria-label="Connect a class"
      className="space-y-5"
    >
      <fieldset disabled={busy} className="space-y-5">
        <Field label="Connection file">
          <Input
            type="file"
            accept=".json,application/json"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Connection passphrase">
          <Input
            type="password"
            autoComplete="off"
            required
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
          />
        </Field>
      </fieldset>
      {error && (
        <p key={attempt} role="alert" className="gaps-shake text-sm text-negative">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className={`${buttonClassName('primary', 'lg')} gaps-press flex-1`}
        >
          {busy && <Spinner />}
          {busy ? 'Checking ownership…' : 'Connect'}
        </button>
        {busy && (
          <button
            type="button"
            className={buttonClassName('ghost', 'lg')}
            onClick={() => controller.current?.abort()}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
