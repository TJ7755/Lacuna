import {
  Fragment,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { buttonClassName } from '../components/ui/buttonStyles';
import { cn } from '../components/ui/cn';
import { SectionCard } from '../components/ui/SectionCard';
import type { DailyEvidence } from '../insights/evidence';
import { band, itemsToRevisit, mean, percent, pupilScore, summariseItems } from './classInsights';
import { BAND_COLOUR, BAND_LABEL, Disclosure, DisclosureChevron } from './gapsUi';
import { activityCount, DetailRow, DetailHeader, Evidence, ItemAnswers } from './ClassEvidence';

type Open = { kind: 'pupil'; id: string; focus?: string } | { kind: 'item'; itemId: string };

/** Columns shown before the grid asks to show every item. */
const GRID_ITEMS = 12;

export function Results({ reports }: { reports: DailyEvidence[] }) {
  const items = useMemo(() => summariseItems(reports), [reports]);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [revisiting, setRevisiting] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const base = useId();
  const columns = all ? items : items.slice(0, GRID_ITEMS);
  // Include the pupil column and inner/outer table gaps around the 7rem questions.
  const tableWidth = 9 + columns.length * 7 + (columns.length + 2) * 0.375;
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
          <table
            className="gaps-grid table-fixed border-separate border-spacing-x-1.5 border-spacing-y-1.5 text-sm"
            style={{ width: `${tableWidth}rem` }}
          >
            <colgroup>
              <col className="w-36" />
              {columns.map((item) => (
                <col key={item.itemId} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="pr-3 text-left align-bottom text-xs font-normal text-ink-faint"
                >
                  Weakest first
                </th>
                {columns.map((item) => (
                  <th key={item.itemId} scope="col" className="align-bottom font-normal">
                    <button
                      type="button"
                      onClick={() => showItem(item.itemId)}
                      aria-expanded={open?.kind === 'item' && open.itemId === item.itemId}
                      aria-controls={`${base}-item`}
                      title={item.prompt}
                      className={cn(
                        'hit-target group block w-full rounded-xl px-2 pb-2 pt-1 text-left transition-colors hover:bg-ink/5',
                        open?.kind === 'item' && open.itemId === item.itemId && 'bg-ink/[0.06]',
                      )}
                    >
                      <span className="block min-w-0 truncate text-xs leading-snug text-ink-soft group-hover:text-ink">
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
                      <th scope="row" className="pr-3 text-left font-normal">
                        <button
                          type="button"
                          onClick={() => showPupil(report.pupil.id)}
                          aria-expanded={expanded}
                          aria-controls={`${base}-${row}`}
                          className={cn(
                            'hit-target block w-full truncate rounded-full py-1.5 text-left transition-colors hover:text-ink group-hover/row:text-ink',
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
                                'hit-target gaps-cell block h-9 w-full rounded-[10px] text-xs font-semibold text-ink transition-[transform,filter] duration-200 hover:scale-[1.06] hover:brightness-110',
                                attempted ? 'opacity-85' : 'bg-ink/[0.05]',
                              )}
                            >
                              <span className="rounded-full bg-paper px-2 py-0.5 text-ink">
                                {attempted ? (score === null ? 'Unknown' : percent(score)) : '–'}
                              </span>
                            </button>
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
