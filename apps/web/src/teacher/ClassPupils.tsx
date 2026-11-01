import { useId, useState, type CSSProperties } from 'react';
import { cn } from '../components/ui/cn';
import type { DailyEvidence } from '../insights/evidence';
import { percent, pupilScore } from './classInsights';
import { BandDot, Disclosure, DisclosureChevron, ScoreBar } from './gapsUi';
import { activityCount, Evidence } from './ClassEvidence';

export function Pupils({ reports }: { reports: DailyEvidence[] }) {
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
