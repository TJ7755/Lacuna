import { useId, useState } from 'react';
import type { QuestionEvidenceReport } from '../../course/questionEvidence';
import type { QuestionAnalytics } from '../../questions/analytics';
import { countOf } from '../../utils/plural';
import { QuestionAnalyticsSection } from '../questions/QuestionAnalyticsSection';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { cn } from '../ui/cn';
import { AlertIcon, BookIcon, ChevronDownIcon, HelpIcon, RestoreIcon } from '../ui/icons';
import { MiniRing } from '../ui/MiniRing';
import { SectionCard } from '../ui/SectionCard';
import { InfoPopover } from './InfoPopover';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Questions in the Progress scope at a glance: what is due, marks earned, and marked
 * exam-question evidence by category. The full performance breakdown opens beneath. Evidence
 * stays apart from predicted recall: these are counts, not a score or a forecast.
 */
export function QuestionsOverview({
  analytics,
  evidence,
}: {
  analytics: QuestionAnalytics;
  evidence: QuestionEvidenceReport | undefined;
}) {
  const titleId = useId();
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const metrics = [
    analytics.fixed.firstPresentation,
    analytics.fixed.repeat,
    analytics.generated.novel,
    analytics.generated.repeated,
  ];
  const earned = metrics.reduce((total, metric) => total + metric.marksEarned, 0);
  const available = metrics.reduce((total, metric) => total + metric.marksAvailable, 0);
  const markRate = available > 0 ? earned / available : null;
  const due = analytics.inventory.due;
  const marksName = `Marks earned: ${markRate === null ? 'none yet' : percent(markRate)}`;
  const topicsName =
    evidence &&
    `${evidence.topicsWithEvidence} of ${countOf(evidence.topics, 'topic')} ${
      evidence.topicsWithEvidence === 1 ? 'has' : 'have'
    } marked answers`;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard aria-labelledby={titleId} compact className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h2 id={titleId} className="flex items-center gap-2 font-display text-2xl">
            <HelpIcon width={20} height={20} className="text-ink-soft" aria-hidden="true" />
            Questions
          </h2>
          <span
            role="img"
            aria-label={`Questions: ${analytics.inventory.total}`}
            title={`Questions: ${analytics.inventory.total}`}
            className="font-display text-2xl font-semibold tabular-nums"
          >
            {analytics.inventory.total}
          </span>
          <span
            role="img"
            aria-label={`Due: ${due}`}
            title={`Due: ${due}`}
            className={cn(
              'flex items-center gap-1.5 text-sm tabular-nums',
              due > 0 ? 'text-warning' : 'text-ink-soft',
            )}
          >
            <RestoreIcon width={16} height={16} />
            {due}
          </span>
          <span
            role="img"
            aria-label={marksName}
            title={marksName}
            className="flex items-center gap-1.5 text-sm tabular-nums text-ink-soft"
          >
            <MiniRing value={markRate ?? 0} size={20} />
            {markRate === null ? '–' : percent(markRate)}
          </span>
          {topicsName && evidence.topics > 0 && (
            <span
              role="img"
              aria-label={topicsName}
              title={topicsName}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-sm tabular-nums"
            >
              <BookIcon width={14} height={14} className="text-ink-soft" />
              {evidence.topicsWithEvidence}/{evidence.topics}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <InfoPopover label="About question evidence">
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <MiniRing value={0.6} size={16} /> Share of marked answers that were secure
                </li>
                <li className="flex items-center gap-2">
                  <AlertIcon width={16} height={16} className="text-warning" /> Topics to work on
                </li>
              </ul>
              <p>
                Knowledge and technique are judged separately for each marked answer, counted once
                per topic. Answers with help, corrections, disputed marks or an unsure diagnosis are
                left out. A topic is to work on when its latest answer showed a gap; a topic without
                marked answers is not a gap. These counts never change card recall.
              </p>
            </InfoPopover>
            <button
              type="button"
              aria-label="Question details"
              title="Question details"
              aria-expanded={open}
              aria-controls={detailsId}
              onClick={() => setOpen(!open)}
              className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
            >
              <ChevronDownIcon
                width={18}
                height={18}
                className={cn('transition-transform', open && 'rotate-180')}
              />
            </button>
          </div>
        </div>
        {evidence && evidence.rows.length > 0 && (
          <ul aria-label="Exam-question evidence" className="flex flex-wrap gap-2">
            {evidence.rows.map((row) => {
              const marked = row.demonstrated + row.gaps;
              const name = `${row.name}: ${row.demonstrated} secure, ${row.gaps} ${
                row.gaps === 1 ? 'gap' : 'gaps'
              }, ${countOf(row.topicsWithGap, 'topic')} to work on`;
              return (
                <li
                  key={row.id}
                  title={name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 py-1 pl-1 pr-3 text-sm"
                >
                  <MiniRing value={marked ? row.demonstrated / marked : 0} size={20} />
                  <span aria-hidden="true">{row.name}</span>
                  {row.topicsWithGap > 0 && (
                    <span aria-hidden="true" className="flex items-center gap-1 text-warning">
                      <AlertIcon width={14} height={14} />
                      {row.topicsWithGap}
                    </span>
                  )}
                  <span className="sr-only">{name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      <div id={detailsId}>
        <AnimatedDisclosure open={open}>
          <QuestionAnalyticsSection analytics={analytics} embedded />
        </AnimatedDisclosure>
      </div>
    </div>
  );
}
