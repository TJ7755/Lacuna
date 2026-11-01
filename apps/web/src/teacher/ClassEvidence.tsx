import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../components/ui/cn';
import { CloseIcon } from '../components/ui/icons';
import type { DailyEvidence, DailyEvidenceEvent } from '../insights/evidence';
import {
  band,
  eventScore,
  groupAnswers,
  markingLabel,
  outcomeLabel,
  percent,
  type ItemSummary,
} from './classInsights';
import { BAND_COLOUR, BandDot, Disclosure, ScoreBar, usePresence } from './gapsUi';

export function activityCount(report: DailyEvidence) {
  return `${report.events.length} ${report.events.length === 1 ? 'activity' : 'activities'}`;
}

/** A grid row that opens beneath its pupil or the item headings, spanning the visible grid. */
export function DetailRow({
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

export function DetailHeader({
  title,
  meta,
  onClose,
}: {
  title: string;
  meta: string;
  onClose(): void;
}) {
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

export function Evidence({ report, focus }: { report: DailyEvidence; focus?: string }) {
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

export function ItemAnswers({ item }: { item: ItemSummary }) {
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
            key={index}
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
                <p className="mt-1.5 text-xs text-ink-soft">
                  {outcomeLabel(group.answers[0].event)} · {markingLabel(group.answers[0].event)}
                  {group.answers[0].event.disputed && ' · disputed by the pupil'}
                  {group.answers[0].event.shortened && ' · shortened for this report'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
