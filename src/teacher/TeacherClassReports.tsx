import { useEffect, useRef, useState } from 'react';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { cn } from '../components/ui/cn';
import { ChevronLeftIcon, ChevronRightIcon, QrCodeIcon, RefreshIcon } from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import { DAY_MS, isoDayLabel, isoDayStartMs } from '../../relay/shared/insights/index';
import type { DailyEvidence } from '../insights/evidence';
import { dayLabel } from './classInsights';
import { type ConnectedGapsCourse } from './connectionStore';
import { SlidingTabs, Spinner } from './gapsUi';
import { forgetRememberedClass } from './rememberedClass';
import { readClassReports } from './readReports';
import type { ClassRequest, ClassSession } from './StandaloneTeacherHome';
import { createDemoReports } from './demoClass';
import { ResultsSkeleton, Results } from './ClassResults';
import { Pupils } from './ClassPupils';
import { LockedClass } from './ClassAccess';
import { Invite } from './ClassInvite';
import { ClassSettings } from './ClassSettings';

type Tab = 'results' | 'pupils' | 'invite';

/** Reports are retained for 84 days after their reporting day. */
const RETENTION_DAYS = 84;

export function DemoClassPage({ onExit }: { onExit(): void }) {
  const [reports] = useState(createDemoReports);
  const [tab, setTab] = useState<'results' | 'pupils'>('results');
  const [reset, setReset] = useState(0);

  return (
    <div className={`${PAGE_FRAME} pb-24`}>
      <header className={cn(PAGE_HEADER, 'md:pt-12')}>
        <h1 tabIndex={-1} data-page-title className={cn(PAGE_TITLE, 'min-w-0 break-words')}>
          Biology — fictional demo
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClassName('secondary')}
            onClick={() => {
              setTab('results');
              setReset((value) => value + 1);
            }}
          >
            Reset demo
          </button>
          <button type="button" onClick={onExit} className={buttonClassName('ghost')}>
            Exit demo
          </button>
        </div>
      </header>
      <SectionCard className="mb-6 p-5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">
          Fictional demo: six invented pupils and answers. Nothing is saved or sent.
        </p>
        <p className="mt-2">
          Choose “Explain osmosis.” to inspect the shared answer, or choose a pupil. Some evidence
          is self marked or unknown; it is not a verified assessment.
        </p>
      </SectionCard>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <SlidingTabs<'results' | 'pupils'>
          label="Class view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'results', label: 'Results' },
            { value: 'pupils', label: 'Pupils' },
          ]}
        />
        <p className="text-sm text-ink-faint">6 fictional reports · 3 questions</p>
      </div>
      <div key={reset}>
        {tab === 'results' ? <Results reports={reports} /> : <Pupils reports={reports} />}
      </div>
    </div>
  );
}

export function ClassPage({
  course,
  session,
  request,
  onUnlocked,
  beginUnlock,
  onChanged,
  onLock,
  onRemoved,
}: {
  course: ConnectedGapsCourse;
  session: ClassSession | null;
  /** Each new request opens the locked card at that step, with focus on its first field. */
  request: ClassRequest | null;
  onUnlocked(session: ClassSession): void;
  beginUnlock?(): (session: ClassSession) => boolean;
  onChanged(): void;
  onLock(): void;
  onRemoved(): void;
}) {
  const latest = isoDayLabel(Date.now());
  const earliest = isoDayLabel(isoDayStartMs(latest) - RETENTION_DAYS * DAY_MS);
  const [forgetting, setForgetting] = useState(false);
  const [forgetBusy, setForgetBusy] = useState(false);
  const [forgetError, setForgetError] = useState('');
  const forgetTrigger = useRef<HTMLButtonElement>(null);
  const cancelForget = useRef<HTMLButtonElement>(null);
  const wasForgetting = useRef(false);
  useEffect(() => {
    if (forgetting) cancelForget.current?.focus();
    else if (wasForgetting.current) forgetTrigger.current?.focus();
    wasForgetting.current = forgetting;
  }, [forgetting]);
  const [tab, setTab] = useState<Tab>('results');
  const [day, setDay] = useState(latest);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const shown = useRef<{ day: string; reports: DailyEvidence[]; unreadable: number } | null>(null);
  const result = session?.days.get(day);

  // Reading a day is the request: unlocking reads the latest day, stepping reads the next.
  useEffect(() => {
    setError('');
    if (!session || session.days.has(day)) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    // A short pause lets a teacher step through several days with one request.
    const timer = setTimeout(
      () => {
        readClassReports({
          ...session.connection,
          owner: session.owner,
          isoDay: day,
          signal: controller.signal,
        })
          .then((loaded) => {
            if (controller.signal.aborted) return;
            session.days.set(day, loaded);
            onChanged();
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted)
              setError(cause instanceof Error ? cause.message : 'Could not read the reports.');
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      shown.current ? 280 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      setLoading(false);
    };
  }, [session, day, attempt, onChanged]);

  const view = result
    ? { day, reports: result.reports.map(({ report }) => report), unreadable: result.unreadable }
    : null;
  if (view) shown.current = view;
  if (!session) shown.current = null;
  const stale = !view && loading ? shown.current : null;

  useEffect(() => {
    if (!session || tab === 'invite') return;
    function onKey(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest('input, textarea, select, [role="dialog"]')) return;
      if (event.key === '[') setDay((current) => step(current, -1, earliest, latest));
      if (event.key === ']') setDay((current) => step(current, 1, earliest, latest));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, tab, earliest, latest]);

  const data = view ?? stale;

  return (
    <div className={`${PAGE_FRAME} pb-24`}>
      <header className={cn(PAGE_HEADER, 'md:pt-12')}>
        <h1 tabIndex={-1} data-page-title className={cn(PAGE_TITLE, 'min-w-0 break-words')}>
          {course.courseName}
        </h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {session && (
            <>
              <button
                type="button"
                onClick={() => setTab('invite')}
                className={`${buttonClassName('secondary')} gaps-press`}
              >
                <QrCodeIcon width={18} height={18} /> Class code
              </button>
              {session.remembered && (
                <button
                  ref={forgetTrigger}
                  type="button"
                  className={buttonClassName('ghost')}
                  onClick={() => setForgetting(true)}
                >
                  Forget on this device
                </button>
              )}
              <button type="button" onClick={onLock} className={buttonClassName('ghost')}>
                {session.remembered ? 'Close' : 'Lock'}
              </button>
            </>
          )}
        </div>
      </header>

      {session?.remembered && forgetting && (
        <div className="mb-4">
          <div
            role="group"
            aria-busy={forgetBusy}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !forgetBusy) {
                setForgetError('');
                setForgetting(false);
              }
            }}
            className="gaps-fade flex flex-col gap-3 rounded-2xl border border-negative/20 bg-negative/5 p-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p hidden={course.secret === 'recovery-code'} className="text-sm text-ink-soft">
                This browser will ask for both passphrases next time. Your class, reports and
                recovery file are not affected.
              </p>
              {forgetError && (
                <p role="alert" className="text-negative text-sm">
                  {forgetError}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={forgetBusy}
                className={buttonClassName('danger', 'sm')}
                onClick={() => {
                  setForgetError('');
                  setForgetBusy(true);
                  void forgetRememberedClass(course.shareId)
                    .then(onLock)
                    .catch(() => {
                      setForgetError('Could not forget this class. Try again.');
                      setForgetBusy(false);
                    });
                }}
              >
                Forget
              </button>
              <button
                ref={cancelForget}
                type="button"
                disabled={forgetBusy}
                className={buttonClassName('secondary', 'sm')}
                onClick={() => {
                  setForgetError('');
                  setForgetting(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!session ? (
        <LockedClass
          course={course}
          request={request}
          onUnlocked={onUnlocked}
          beginUnlock={beginUnlock}
        />
      ) : (
        <>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <SlidingTabs<Tab>
              label="Class view"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'results', label: 'Results' },
                { value: 'pupils', label: 'Pupils' },
                { value: 'invite', label: 'Invite' },
              ]}
            />
            {tab !== 'invite' && (
              <DayStepper
                day={day}
                count={view?.reports.length}
                loading={loading}
                onReload={
                  view && !loading
                    ? () => {
                        // Invalidate before reading so a failed refresh cannot look up to date.
                        session.days.delete(day);
                        setLoading(true);
                        setAttempt((value) => value + 1);
                        onChanged();
                      }
                    : undefined
                }
                earliest={earliest}
                latest={latest}
                onChange={setDay}
              />
            )}
          </div>

          {tab !== 'invite' && day === latest && (
            <p className="mb-6 max-w-2xl text-sm text-ink-soft">
              Partial UTC results. Ask pupils to Send latest progress, then Refresh results.
            </p>
          )}

          {tab !== 'invite' && !error && data && data.unreadable > 0 && (
            <p
              role="status"
              className="mb-4 inline-flex items-center gap-2 rounded-full bg-negative/10 px-4 py-2 text-sm text-negative"
            >
              {data.unreadable === 1
                ? '1 report could not be read and is left out.'
                : `${data.unreadable} reports could not be read and are left out.`}
            </p>
          )}

          {tab === 'invite' ? (
            <Invite course={course} session={session} onChanged={onChanged} />
          ) : error ? (
            <SectionCard className="gaps-rise flex flex-col items-start gap-4 p-8">
              <p role="alert" className="text-negative">
                {error}
              </p>
              <button
                type="button"
                className={buttonClassName('secondary')}
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </SectionCard>
          ) : !data ? (
            <ResultsSkeleton />
          ) : data.reports.length === 0 ? (
            <SectionCard
              key={data.day}
              className={cn(
                'gaps-rise flex flex-col items-center px-6 py-16 text-center transition-opacity duration-300',
                stale && 'opacity-50',
              )}
            >
              <StudyDrawing kind="time" className="mb-6 h-24 w-24" />
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {data.unreadable > 0 ? 'No readable reports' : 'No reports'} for{' '}
                {dayLabel(data.day)}
              </h2>
              <p role="status" className="mt-3 max-w-sm text-ink-soft">
                {data.unreadable > 0
                  ? 'Reports arrived but could not be decrypted with this key. Check the class recovery key and try again.'
                  : 'No report does not mean no study.'}
              </p>
              <button
                type="button"
                className={`${buttonClassName('secondary')} gaps-press mt-8`}
                onClick={() => setTab('invite')}
              >
                Share class code
              </button>
            </SectionCard>
          ) : (
            <div
              key={data.day}
              aria-busy={Boolean(stale)}
              className={cn(
                'transition-opacity duration-300',
                stale && 'pointer-events-none opacity-50',
              )}
            >
              {tab === 'results' ? (
                <Results reports={data.reports} />
              ) : (
                <Pupils reports={data.reports} />
              )}
            </div>
          )}
        </>
      )}

      <ClassSettings course={course} locked={!session} onRemoved={onRemoved} />
    </div>
  );
}

function step(day: string, delta: number, earliest: string, latest: string) {
  const next = isoDayLabel(isoDayStartMs(day) + delta * DAY_MS);
  return next < earliest || next > latest ? day : next;
}

function DayStepper({
  day,
  count,
  loading,
  earliest,
  latest,
  onChange,
  onReload,
}: {
  day: string;
  count?: number;
  loading: boolean;
  earliest: string;
  latest: string;
  onChange(day: string): void;
  onReload?(): void;
}) {
  const arrow =
    'hit-target grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30';
  return (
    <div
      role="group"
      aria-label="Reporting day"
      className="flex max-w-full flex-wrap items-center gap-2"
    >
      <div className="flex items-center gap-1 rounded-full bg-surface p-1 card-surface">
        <button
          type="button"
          aria-label="Previous day"
          title="Previous day ( [ )"
          disabled={day <= earliest}
          onClick={() => onChange(step(day, -1, earliest, latest))}
          className={arrow}
        >
          <ChevronLeftIcon width={18} height={18} />
        </button>
        <span
          aria-live="polite"
          className="flex min-w-48 items-center justify-center gap-2.5 px-1 text-sm tabular-nums"
        >
          <span className="font-semibold">
            {day === latest ? 'Today (UTC)' : dayLabel(day, 'short')}
          </span>
          {loading ? (
            <>
              <Spinner className="h-3.5 w-3.5 text-ink-faint" />
              <span className="sr-only">Reading reports…</span>
            </>
          ) : (
            count !== undefined && <span className="text-ink-faint">{count} reports</span>
          )}
        </span>
        <button
          type="button"
          aria-label="Next day"
          title="Next day ( ] )"
          disabled={day >= latest}
          onClick={() => onChange(step(day, 1, earliest, latest))}
          className={arrow}
        >
          <ChevronRightIcon width={18} height={18} />
        </button>
      </div>
      <button
        type="button"
        disabled={!onReload || loading}
        onClick={onReload}
        className={buttonClassName('ghost', 'sm')}
      >
        <RefreshIcon width={17} height={17} />
        Refresh results
      </button>
    </div>
  );
}
