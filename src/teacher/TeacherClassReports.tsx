import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { PAGE_FRAME, PAGE_HEADER, PAGE_TITLE } from '../components/course/coursePageLayout';
import { buttonClassName } from '../components/ui/buttonStyles';
import { cn } from '../components/ui/cn';
import { Field, Input } from '../components/ui/Field';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  QrCodeIcon,
  RefreshIcon,
  UnlockIcon,
} from '../components/ui/icons';
import { SectionCard } from '../components/ui/SectionCard';
import { StudyDrawing } from '../components/ui/StudyDrawing';
import {
  completedIsoDayLabel,
  DAY_MS,
  isoDayLabel,
  isoDayStartMs,
} from '../../relay/src/insightsDay';
import { publishClassRecipient } from '../insights/classKey';
import { formatClassCode } from '../insights/classCode';
import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';
import { createInsightsOwnerStore } from '../insights/ownerStore';
import {
  band,
  dayLabel,
  eventScore,
  groupAnswers,
  itemsToRevisit,
  markingLabel,
  mean,
  outcomeLabel,
  percent,
  pupilScore,
  summariseItems,
  type ItemSummary,
} from './classInsights';
import { createGapsConnectionStore, type ConnectedGapsCourse } from './connectionStore';
import {
  BAND_COLOUR,
  BAND_LABEL,
  BandDot,
  ClassGlyph,
  Disclosure,
  DisclosureChevron,
  focusFirstField,
  ScoreBar,
  SlidingTabs,
  Spinner,
  usePresence,
} from './gapsUi';
import { readClassReports } from './readReports';
import type { ClassRequest, ClassSession } from './StandaloneTeacherHome';
import type * as KeysExports from './TeacherKeySetup';

type Tab = 'results' | 'pupils' | 'invite';
type Open = { kind: 'pupil'; id: string; focus?: string } | { kind: 'item'; itemId: string };

/** Reports are retained for 84 days after their reporting day. */
const RETENTION_DAYS = 84;
/** Columns shown before the grid asks to show every item. */
const GRID_ITEMS = 12;

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
  const latest = completedIsoDayLabel(Date.now());
  const earliest = isoDayLabel(isoDayStartMs(latest) - (RETENTION_DAYS - 1) * DAY_MS);
  const [tab, setTab] = useState<Tab>('results');
  const [day, setDay] = useState(latest);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const shown = useRef<{ day: string; reports: DailyEvidence[]; unreadable: number } | null>(null);
  const result = session?.days.get(day);

  // Reading a day is the request: unlocking reads the latest day, stepping reads the next.
  useEffect(() => {
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
        <div className="flex shrink-0 items-center gap-2">
          {session && (
            <>
              <button
                type="button"
                onClick={() => setTab('invite')}
                className={`${buttonClassName('secondary')} gaps-press`}
              >
                <QrCodeIcon width={18} height={18} /> Class code
              </button>
              <button type="button" onClick={onLock} className={buttonClassName('ghost')}>
                Lock
              </button>
            </>
          )}
        </div>
      </header>

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
                  view
                    ? () => {
                        // Reports keep arriving as pupils open Lacuna, so a day can be read again.
                        session.days.delete(day);
                        setAttempt((value) => value + 1);
                      }
                    : undefined
                }
                earliest={earliest}
                latest={latest}
                onChange={setDay}
              />
            )}
          </div>

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
                No reports for {dayLabel(data.day)}
              </h2>
              <p role="status" className="mt-3 max-w-sm text-ink-soft">
                No report does not mean no study. Reports arrive when pupils next open Lacuna
                online.
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
              {data.unreadable > 0 && (
                <p
                  role="status"
                  className="mb-4 inline-flex items-center gap-2 rounded-full bg-negative/10 px-4 py-2 text-sm text-negative"
                >
                  {data.unreadable === 1
                    ? '1 report could not be read and is left out.'
                    : `${data.unreadable} reports could not be read and are left out.`}
                </p>
              )}
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

/** Loads the key set-up form when it is first needed, as the shell loads each screen. */
function useKeySetup(needed: boolean) {
  const [Keys, setKeys] = useState<typeof KeysExports | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (needed && !Keys) void import('./TeacherKeySetup').then(setKeys, () => setFailed(true));
  }, [needed, Keys]);
  return { Keys, failed };
}

function KeySetupSlot({
  keys,
  children,
}: {
  keys: ReturnType<typeof useKeySetup>;
  children(Keys: typeof KeysExports): ReactNode;
}) {
  if (keys.Keys) return children(keys.Keys);
  return keys.failed ? (
    <p role="alert" className="text-sm text-negative">
      Could not open key set-up. Reload Gaps to try again.
    </p>
  ) : (
    <p role="status" className="flex items-center gap-3 py-6 text-ink-soft">
      <Spinner /> Opening key set-up…
    </p>
  );
}

/** The locked class asks for its passphrases in place; first-time set-up swaps in beside it. */
function LockedClass({
  course,
  request,
  onUnlocked,
  beginUnlock,
}: {
  course: ConnectedGapsCourse;
  request: ClassRequest | null;
  onUnlocked(session: ClassSession): void;
  beginUnlock?(): (session: ClassSession) => boolean;
}) {
  const [step, setStep] = useState<ClassRequest['kind']>(request?.kind ?? 'unlock');
  const card = useRef<HTMLDivElement>(null);
  // The step whose first field takes focus once it has rendered.
  const focusNext = useRef<ClassRequest['kind'] | null>(request?.kind ?? null);
  const keys = useKeySetup(step === 'setup');

  useEffect(() => {
    if (!request) return;
    setStep(request.kind);
    focusNext.current = request.kind;
  }, [request]);
  // Focus waits for the step's form, which may still be loading.
  useEffect(() => {
    if (focusNext.current !== step || (step === 'setup' && !keys.Keys)) return;
    focusNext.current = null;
    focusFirstField(card.current);
  }, [step, keys.Keys, request]);

  function show(next: ClassRequest['kind']) {
    setStep(next);
    focusNext.current = next;
  }

  return (
    <SectionCard className="gaps-rise flex flex-col items-center px-6 py-14 text-center md:py-16">
      <ClassGlyph locked size={64} />
      <div ref={card} key={step} className="gaps-fade flex w-full flex-col items-center">
        <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">
          {step === 'unlock' ? 'Unlock to see results' : 'Protect this class'}
        </h2>
        <p className="mt-3 max-w-sm text-ink-soft">
          {step === 'unlock'
            ? 'Results are decrypted only on this device.'
            : 'Only this key can read your pupils’ reports.'}
        </p>
        <div className="mt-10 w-full max-w-sm text-left">
          {step === 'unlock' ? (
            <UnlockForm
              course={course}
              onUnlocked={onUnlocked}
              beginUnlock={beginUnlock}
              onSetup={() => show('setup')}
            />
          ) : (
            <KeySetupSlot keys={keys}>
              {(Keys) => (
                <Keys.TeacherKeySetup
                  initialCourse={course.shareId}
                  initialMode="create"
                  onContinue={() => show('unlock')}
                />
              )}
            </KeySetupSlot>
          )}
        </div>
        <button
          type="button"
          onClick={() => show(step === 'unlock' ? 'setup' : 'unlock')}
          className={`${buttonClassName('ghost')} mt-4`}
        >
          {step === 'unlock' ? 'First time? Set up' : 'Back to unlock'}
        </button>
      </div>
    </SectionCard>
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
    'grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30';
  return (
    <div
      role="group"
      aria-label="Reporting day"
      className="flex items-center gap-1 rounded-full bg-surface p-1 card-surface"
    >
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
          {day === latest ? 'Yesterday' : dayLabel(day, 'short')}
        </span>
        {loading ? (
          <Spinner className="h-3.5 w-3.5 text-ink-faint" />
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
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />
      <button
        type="button"
        aria-label="Read again"
        title="Read again"
        disabled={!onReload}
        onClick={onReload}
        className={arrow}
      >
        <RefreshIcon width={17} height={17} />
      </button>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <SectionCard aria-busy="true" className="gaps-fade p-6 md:p-8">
      <span role="status" className="sr-only">
        Reading reports…
      </span>
      <div className="gaps-skeleton h-7 w-48 rounded-lg" />
      <div className="mt-8 grid grid-cols-[8rem_repeat(5,1fr)] gap-2">
        {Array.from({ length: 36 }, (_, index) => (
          <div
            key={index}
            className={cn(
              'gaps-skeleton h-9 rounded-[10px]',
              index % 6 === 0 && 'mr-4 h-5 self-center',
            )}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function Results({ reports }: { reports: DailyEvidence[] }) {
  const items = useMemo(() => summariseItems(reports), [reports]);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [revisiting, setRevisiting] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const base = useId();
  const columns = all ? items : items.slice(0, GRID_ITEMS);
  const revisit = itemsToRevisit(items);
  const activities = reports.reduce((sum, report) => sum + report.events.length, 0);
  const openItem = open?.kind === 'item' ? items.find((item) => item.itemId === open.itemId) : null;

  // Detail rows span the whole grid but stay in view while its items scroll sideways.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () =>
      element.style.setProperty('--gaps-view', `${Math.max(0, element.clientWidth - 16)}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function showPupil(id: string, focus?: string) {
    // A name toggles its row; a cell opens it at that answer.
    setOpen((current) =>
      current?.kind === 'pupil' && current.id === id && !focus
        ? null
        : { kind: 'pupil', id, focus },
    );
  }
  function showItem(itemId: string) {
    setOpen((current) =>
      current?.kind === 'item' && current.itemId === itemId ? null : { kind: 'item', itemId },
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <SectionCard className="gaps-rise p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Class results</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft" aria-label="Key">
            {(['secure', 'partial', 'gap'] as const).map((key) => (
              <li key={key} className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: BAND_COLOUR[key] }}
                />
                {BAND_LABEL[key]}
              </li>
            ))}
          </ul>
        </div>

        <div ref={grid} className="-mx-2 mt-6 overflow-x-auto px-2 pb-2">
          <table className="gaps-grid w-full border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="w-36 min-w-28 pr-3 text-left align-bottom text-xs font-normal text-ink-faint"
                >
                  Weakest first
                </th>
                {columns.map((item) => (
                  <th
                    key={item.itemId}
                    scope="col"
                    className="min-w-[6.5rem] max-w-[11rem] align-bottom font-normal"
                  >
                    <button
                      type="button"
                      onClick={() => showItem(item.itemId)}
                      aria-expanded={open?.kind === 'item' && open.itemId === item.itemId}
                      aria-controls={`${base}-item`}
                      title={item.prompt}
                      className={cn(
                        'group block w-full rounded-xl px-2 pb-2 pt-1 text-left transition-colors hover:bg-ink/5',
                        open?.kind === 'item' && open.itemId === item.itemId && 'bg-ink/[0.06]',
                      )}
                    >
                      <span className="line-clamp-2 text-xs leading-snug text-ink-soft group-hover:text-ink">
                        {item.prompt || 'Untitled item'}
                      </span>
                      <span className="mt-1.5 block font-display text-lg font-semibold tabular-nums">
                        {percent(item.score)}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <DetailRow
                open={Boolean(openItem)}
                id={`${base}-item`}
                span={columns.length + 1}
                label="Answers"
                onClose={() => setOpen(null)}
              >
                {openItem && (
                  <>
                    <DetailHeader
                      title={openItem.prompt || 'Untitled item'}
                      meta={`${openItem.pupils} ${openItem.pupils === 1 ? 'pupil' : 'pupils'}`}
                      onClose={() => setOpen(null)}
                    />
                    <ItemAnswers item={openItem} />
                  </>
                )}
              </DetailRow>
              {reports.map((report, row) => {
                const expanded = open?.kind === 'pupil' && open.id === report.pupil.id;
                return (
                  <Fragment key={report.pupil.id}>
                    <tr className="group/row">
                      <th scope="row" className="max-w-36 pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={() => showPupil(report.pupil.id)}
                          aria-expanded={expanded}
                          aria-controls={`${base}-${row}`}
                          className={cn(
                            'block w-full truncate rounded-lg py-1.5 text-left transition-colors hover:text-ink group-hover/row:text-ink',
                            expanded ? 'font-semibold text-ink' : 'text-ink-soft',
                          )}
                        >
                          {report.pupil.label}
                        </button>
                      </th>
                      {columns.map((item, column) => {
                        const attempted = item.byPupil.has(report.pupil.id);
                        const score = item.byPupil.get(report.pupil.id) ?? null;
                        const focus = report.events.find(
                          (event) => event.itemId === item.itemId,
                        )?.id;
                        return (
                          <td key={item.itemId} className="p-0">
                            <button
                              type="button"
                              tabIndex={-1}
                              disabled={!attempted}
                              onClick={() => showPupil(report.pupil.id, focus)}
                              aria-label={`${report.pupil.label}, ${item.prompt}: ${attempted ? (score === null ? 'unknown' : percent(score)) : 'not attempted'}`}
                              style={
                                {
                                  '--row': row,
                                  '--col': column,
                                  background: attempted ? BAND_COLOUR[band(score)] : undefined,
                                } as CSSProperties
                              }
                              className={cn(
                                'gaps-cell block h-9 w-full rounded-[10px] transition-[transform,filter] duration-200 hover:scale-[1.06] hover:brightness-110',
                                attempted ? 'opacity-85' : 'bg-ink/[0.05]',
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                    <DetailRow
                      open={expanded}
                      id={`${base}-${row}`}
                      span={columns.length + 1}
                      label={`Evidence for ${report.pupil.label}`}
                      focus={expanded ? open.focus : undefined}
                      onClose={() => setOpen(null)}
                    >
                      <DetailHeader
                        title={report.pupil.label}
                        meta={activityCount(report)}
                        onClose={() => setOpen(null)}
                      />
                      <Evidence report={report} focus={expanded ? open.focus : undefined} />
                    </DetailRow>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {items.length > GRID_ITEMS && (
          <button
            type="button"
            onClick={() => setAll((value) => !value)}
            className={`${buttonClassName('ghost', 'sm')} mt-2`}
          >
            {all ? 'Show the weakest only' : `Show all ${items.length} items`}
          </button>
        )}

        <div className="mt-8 grid grid-cols-3 gap-6 border-t border-line pt-6">
          <Stat value={reports.length} label="reports" />
          <Stat value={activities} label="activities" />
          <Stat value={percent(mean(reports.map(pupilScore)))} label="secure" />
        </div>
      </SectionCard>

      {revisit.length > 0 && (
        <section aria-labelledby="revisit-heading">
          <h2
            id="revisit-heading"
            className="mb-4 font-display text-2xl font-semibold tracking-tight"
          >
            Worth revisiting
          </h2>
          <ul className="flex flex-col gap-3">
            {revisit.map((item, index) => {
              const expanded = revisiting === item.itemId;
              return (
                <li
                  key={item.itemId}
                  style={{ '--i': index + 2 } as CSSProperties}
                  className={cn(
                    'gaps-rise rounded-[20px] bg-surface card-surface transition-colors',
                    expanded ? 'bg-surface-raised' : 'gaps-lift hover:bg-surface-raised',
                  )}
                >
                  <div className="flex items-center gap-4 py-3.5 pl-5 pr-3.5 sm:gap-5 sm:pl-6">
                    <span
                      className="w-14 shrink-0 font-display text-2xl font-semibold tabular-nums"
                      style={{ color: BAND_COLOUR[band(item.score)] }}
                    >
                      {percent(item.score)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words font-semibold">
                        {item.prompt || 'Untitled item'}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-faint">
                        {item.gaps} of {item.pupils} with a gap
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`${base}-revisit-${index}`}
                      onClick={() => setRevisiting(expanded ? null : item.itemId)}
                      className={`${buttonClassName(index === 0 && !expanded ? 'primary' : 'secondary')} gaps-press`}
                    >
                      Answers <DisclosureChevron open={expanded} className="text-current" />
                    </button>
                  </div>
                  <Disclosure
                    open={expanded}
                    id={`${base}-revisit-${index}`}
                    className="px-5 pb-5 sm:px-6"
                  >
                    <ItemAnswers item={item} />
                  </Disclosure>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <p className="text-xs text-ink-faint">
        Names are self-reported. Treat results as study signals, not marks.
      </p>
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

function activityCount(report: DailyEvidence) {
  return `${report.events.length} ${report.events.length === 1 ? 'activity' : 'activities'}`;
}

function Pupils({ reports }: { reports: DailyEvidence[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  // Lowest first, so a pupil who may need a word is at the top. Unknown sorts last.
  const order = [...reports].sort((a, b) => (pupilScore(a) ?? 2) - (pupilScore(b) ?? 2));
  return (
    <ul aria-label="Pupils" className="flex flex-col gap-3">
      {order.map((report, index) => {
        const score = pupilScore(report);
        const expanded = open === report.pupil.id;
        return (
          <li
            key={report.pupil.id}
            style={{ '--i': index } as CSSProperties}
            className={cn(
              'gaps-rise rounded-[20px] bg-surface card-surface transition-colors',
              expanded ? 'bg-surface-raised' : 'gaps-lift hover:bg-surface-raised',
            )}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${base}-${index}`}
              onClick={() => setOpen(expanded ? null : report.pupil.id)}
              className="flex w-full items-center gap-4 rounded-[20px] py-4 pl-5 pr-5 text-left sm:gap-5 sm:pl-6"
            >
              <BandDot score={score} />
              <span className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">
                {report.pupil.label}
              </span>
              <span className="text-sm text-ink-faint max-sm:hidden">{activityCount(report)}</span>
              <ScoreBar score={score} index={index} className="w-32 max-sm:hidden" />
              <span className="w-12 text-right font-semibold tabular-nums">{percent(score)}</span>
              <DisclosureChevron open={expanded} />
            </button>
            <Disclosure open={expanded} id={`${base}-${index}`} className="px-5 pb-5 sm:px-6">
              <section aria-label={`Evidence for ${report.pupil.label}`}>
                <Evidence report={report} />
              </section>
            </Disclosure>
          </li>
        );
      })}
    </ul>
  );
}

/** A grid row that opens beneath its pupil or the item headings, spanning the visible grid. */
function DetailRow({
  open,
  id,
  span,
  label,
  focus,
  onClose,
  children,
}: {
  open: boolean;
  id: string;
  span: number;
  label: string;
  focus?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const { rendered } = usePresence(open, 460);
  const section = useRef<HTMLElement>(null);
  // Once open, bring the row, or the answer that opened it, into view.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const target =
        section.current?.querySelector('[data-highlighted]') ?? section.current ?? null;
      target?.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [open, focus]);
  if (!rendered) return null;
  return (
    <tr>
      <td colSpan={span} className="p-0">
        <div className="sticky left-0" style={{ width: 'var(--gaps-view)' }}>
          <Disclosure open={open} id={id}>
            <section
              ref={section}
              aria-label={label}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onClose();
              }}
              className="my-2 rounded-[20px] bg-paper p-5 card-surface md:p-6"
            >
              {children}
            </section>
          </Disclosure>
        </div>
      </td>
    </tr>
  );
}

function DetailHeader({ title, meta, onClose }: { title: string; meta: string; onClose(): void }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="line-clamp-2 break-words font-display text-xl font-semibold tracking-tight">
          {title}
        </h3>
        <p className="mt-0.5 text-sm text-ink-faint">{meta}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        title="Close (Esc)"
        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <CloseIcon width={18} height={18} />
      </button>
    </div>
  );
}

function Evidence({ report, focus }: { report: DailyEvidence; focus?: string }) {
  return (
    <>
      {report.omitted > 0 && (
        <p className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-sm text-warning-fg">
          Incomplete: at least {report.omitted} more{' '}
          {report.omitted === 1 ? 'activity was' : 'activities were'} left out of this report.
        </p>
      )}
      {report.events.length === 0 ? (
        <p className="text-ink-soft">No recorded activity in this report.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {report.events.map((event) => (
            <EventRow key={event.id} event={event} highlighted={event.id === focus} />
          ))}
        </ul>
      )}
    </>
  );
}

function EventRow({ event, highlighted }: { event: DailyEvidenceEvent; highlighted: boolean }) {
  return (
    <li
      data-highlighted={highlighted || undefined}
      className={cn(
        'rounded-2xl p-4 card-surface transition-colors duration-300',
        highlighted ? 'bg-accent-soft' : 'bg-ink/[0.03]',
      )}
    >
      <div className="flex gap-3">
        <BandDot score={eventScore(event)} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{event.prompt || 'Untitled item'}</p>
          {event.answer && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">
              {event.answer}
            </p>
          )}
          {event.criteria.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {event.criteria.map((criterion) => {
                const score =
                  criterion.earned === null || !criterion.available
                    ? null
                    : criterion.earned / criterion.available;
                return (
                  <li
                    key={criterion.id}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      color: BAND_COLOUR[band(score)],
                      background: `color-mix(in srgb, ${BAND_COLOUR[band(score)]} 14%, transparent)`,
                    }}
                  >
                    {criterion.label}{' '}
                    <span className="font-normal opacity-80">
                      {criterion.earned ?? 'Unknown'} / {criterion.available}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            {outcomeLabel(event)} · {markingLabel(event)}
            {event.disputed && ' · disputed by the pupil'}
            {event.shortened && ' · shortened for this report'}
          </p>
        </div>
      </div>
    </li>
  );
}

function ItemAnswers({ item }: { item: ItemSummary }) {
  const groups = groupAnswers(item);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <ScoreBar score={item.score} className="h-2 flex-1" />
        <span className="text-sm font-semibold tabular-nums">{percent(item.score)} secure</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {groups.map((group, index) => (
          <li
            key={`${group.answer}-${group.score}`}
            style={{ '--i': index } as CSSProperties}
            className="gaps-rise rounded-2xl bg-ink/[0.03] p-4 card-surface"
          >
            <div className="flex gap-3">
              <BandDot score={group.score} className="mt-1.5" />
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words">
                  {group.answer ? `“${group.answer}”` : outcomeLabel(group.answers[0].event)}
                </p>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {[...new Set(group.answers.map(({ report }) => report.pupil.label))].join(', ')}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnlockForm({
  course,
  onUnlocked,
  beginUnlock,
  onSetup,
}: {
  course: ConnectedGapsCourse;
  onUnlocked(session: ClassSession): void;
  beginUnlock?(): (session: ClassSession) => boolean;
  onSetup(): void;
}) {
  const [connectionPhrase, setConnectionPhrase] = useState('');
  const [keyPhrase, setKeyPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const controller = new AbortController();
    pending.current = controller;
    const retain = beginUnlock?.();
    setBusy(true);
    setError(null);
    const connections = createGapsConnectionStore(),
      keys = createInsightsOwnerStore();
    try {
      const connection = await connections.unlock(course.shareId, connectionPhrase);
      if (!connection) throw new Error('This course connection was removed. Connect it again.');
      const owner = await keys.unlock(course.shareId, keyPhrase);
      controller.signal.throwIfAborted();
      if (!owner) {
        setError({ message: 'This browser has no key for this class yet.', setup: true });
        return;
      }
      const session = { connection, owner, days: new Map() };
      if (retain && !retain(session)) return;
      onUnlocked(session);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError({
        message:
          cause instanceof Error ? cause.message : 'Could not unlock. Check both passphrases.',
        setup: false,
      });
    } finally {
      connections.close();
      keys.close();
      setConnectionPhrase('');
      setKeyPhrase('');
      setBusy(false);
      setAttempt((value) => value + 1);
    }
  }

  return (
    <form onSubmit={(event) => void unlock(event)} aria-label="Unlock class" className="space-y-5">
      <fieldset disabled={busy} className="space-y-5">
        <Field label="Connection passphrase">
          <Input
            type="password"
            autoComplete="off"
            required
            value={connectionPhrase}
            onChange={(event) => setConnectionPhrase(event.target.value)}
          />
        </Field>
        <Field label="Recovery passphrase">
          <Input
            type="password"
            autoComplete="off"
            required
            value={keyPhrase}
            onChange={(event) => setKeyPhrase(event.target.value)}
          />
        </Field>
      </fieldset>
      {error && (
        <div key={attempt} role="alert" className="gaps-shake space-y-3 text-sm text-negative">
          <p>{error.message}</p>
          {error.setup && (
            <button type="button" className={buttonClassName('secondary', 'sm')} onClick={onSetup}>
              Set up or restore this class
            </button>
          )}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className={`${buttonClassName('primary', 'lg')} gaps-press w-full`}
      >
        {busy ? <Spinner /> : <UnlockIcon width={18} height={18} />}
        {busy ? 'Unlocking…' : 'Unlock class'}
      </button>
    </form>
  );
}

function Invite({
  course,
  session,
  onChanged,
}: {
  course: ConnectedGapsCourse;
  session: ClassSession;
  onChanged(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const request = useRef<AbortController | null>(null);
  const code = session.code;
  const link = code ? `https://getlacuna.app/#/s/${code}` : '';

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function publish() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      await publishClassRecipient({
        ...session.connection,
        recipient: session.owner.recipient,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      session.code = formatClassCode({
        shareId: course.shareId,
        keyId: session.owner.recipient.keyId,
      });
      onChanged();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Could not publish the class code.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(message);
    } catch {
      setCopied('Select the field and copy it manually.');
    }
  }

  return (
    <SectionCard className="gaps-rise max-w-3xl p-6 md:p-8">
      {!code ? (
        <div className="flex flex-col items-center py-8 text-center">
          <StudyDrawing kind="course" className="mb-6 h-24 w-24" />
          <h2 className="font-display text-3xl font-semibold tracking-tight">Invite your pupils</h2>
          <p className="mt-3 max-w-sm text-ink-soft">
            Pupils join with a class code, then choose whether to share.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className={`${buttonClassName('primary', 'lg')} gaps-press mt-8`}
          >
            {busy && <Spinner />}
            {busy ? 'Preparing class code…' : 'Publish class code'}
          </button>
        </div>
      ) : (
        <div className="gaps-fade space-y-6">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Invite your pupils</h2>
          <Field label="Pupil join link">
            <Input
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
              className="font-mono text-sm"
            />
          </Field>
          <Field label="Class code">
            <Input
              readOnly
              value={code}
              onFocus={(event) => event.target.select()}
              className="font-mono text-sm"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`${buttonClassName('primary')} gaps-press`}
              onClick={() => void copy(link, 'Join link copied')}
            >
              Copy join link
            </button>
            <button
              type="button"
              className={`${buttonClassName('secondary')} gaps-press`}
              onClick={() => void copy(code, 'Class code copied')}
            >
              Copy class code
            </button>
            {copied && (
              <span
                role="status"
                className="gaps-fade inline-flex items-center gap-1.5 text-sm font-semibold text-positive"
              >
                <CheckIcon width={16} height={16} /> {copied}
              </span>
            )}
          </div>
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

/** Secondary class settings open in place, as a course's settings rows do in Lacuna. */
function ClassSettings({
  course,
  locked,
  onRemoved,
}: {
  course: ConnectedGapsCourse;
  locked: boolean;
  onRemoved(): void;
}) {
  const [open, setOpen] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const id = useId();
  const keys = useKeySetup(recovery);
  const checked = new Date(course.verifiedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <section className="mt-16 border-t border-line pt-2">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-4 rounded-2xl px-2 py-5 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
        >
          <span className="min-w-0 flex-1 font-semibold text-ink">Class settings</span>
          <span className="hidden text-right text-sm font-normal text-ink-faint sm:block">
            Connection checked {checked}
          </span>
          <DisclosureChevron open={open} />
        </button>
      </h2>
      <Disclosure open={open} id={id} className="flex flex-col gap-8 px-2 pb-8 pt-2">
        {!locked && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Recovery file</p>
                <p className="mt-0.5 text-sm text-ink-soft">
                  Save another copy, or restore this class’s key.
                </p>
              </div>
              <button
                type="button"
                aria-expanded={recovery}
                aria-controls={`${id}-recovery`}
                onClick={() => setRecovery(!recovery)}
                className={`${buttonClassName('secondary', 'sm')} gaps-press`}
              >
                Set up or restore this class
                <DisclosureChevron open={recovery} className="text-current" />
              </button>
            </div>
            <Disclosure open={recovery} id={`${id}-recovery`} className="max-w-md pt-6">
              <KeySetupSlot keys={keys}>
                {(Keys) => (
                  <Keys.TeacherKeySetup initialCourse={course.shareId} initialMode="download" />
                )}
              </KeySetupSlot>
            </Disclosure>
          </div>
        )}
        <RemoveClass course={course} onRemoved={onRemoved} />
      </Disclosure>
    </section>
  );
}

/** Removal confirms in place of its button, as Lacuna's danger zone does. */
function RemoveClass({ course, onRemoved }: { course: ConnectedGapsCourse; onRemoved(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (wasConfirming.current) trigger.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  async function remove() {
    setBusy(true);
    setError('');
    const store = createGapsConnectionStore();
    try {
      await store.forget(course.shareId);
      onRemoved();
    } catch {
      setError('Could not remove this connection. Try again.');
      setBusy(false);
    } finally {
      store.close();
    }
  }

  return (
    <div>
      <p className="font-semibold text-negative">Remove connection</p>
      <p className="mb-4 mt-0.5 text-sm text-ink-soft">
        Your course, key and pupils’ copies are kept.
      </p>
      {confirming ? (
        <div
          role="group"
          aria-label="Confirm removal"
          aria-busy={busy}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || busy) return;
            event.preventDefault();
            setConfirming(false);
          }}
          className="gaps-fade flex flex-col gap-3 rounded-2xl border border-negative/20 bg-negative/5 p-4 sm:flex-row sm:items-center"
        >
          <span className="min-w-0 flex-1 text-sm text-ink-soft">
            Remove {course.courseName} from this browser?
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={buttonClassName('danger', 'sm')}
              onClick={() => void remove()}
            >
              Remove from this browser
            </button>
            <button
              ref={keep}
              type="button"
              disabled={busy}
              className={buttonClassName('secondary', 'sm')}
              onClick={() => setConfirming(false)}
            >
              Keep connection
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={buttonClassName('danger', 'sm')}
          onClick={() => setConfirming(true)}
        >
          Remove connection
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
