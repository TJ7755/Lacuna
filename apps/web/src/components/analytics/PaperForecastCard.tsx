import { useId } from 'react';
import type { PaperForecast } from '../../course/courseProgress';
import { formatDate } from '../../utils/datetime';
import { countOf } from '../../utils/plural';
import { MAINTENANCE_HORIZON_DAYS } from '../../fsrs/horizon';
import { Button } from '../ui/Button';
import { SectionCard } from '../ui/SectionCard';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The whole course's forecast when its cards target different dates. One exam-day line
 * would measure every card at one paper, so each date gets its own row instead; selecting
 * an assessment draws that paper's chart.
 */
export function PaperForecastCard({
  papers,
  objectiveLabel,
  timeZone,
  onSelect,
}: {
  papers: PaperForecast[];
  objectiveLabel: string;
  timeZone?: string;
  onSelect: (assessmentId: string) => void;
}) {
  const titleId = useId();
  return (
    <SectionCard aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-2xl">
          Forecast by paper
        </h2>
        <p className="text-sm text-ink-soft">
          Your cards are tested on different dates, so each date is measured on its own if you stop
          reviewing now. Choose a paper to see its exam-day chart.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table aria-label="Forecast by paper date" className="w-full text-left text-sm">
          <thead className="text-xs text-ink-soft">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-3 font-medium">
                Paper
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cards
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                {objectiveLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {papers.map((paper) => (
              <tr key={paper.date ?? 'undated'}>
                <th scope="row" className="py-3 pr-3 font-normal">
                  {paper.date === undefined ? (
                    <span className="text-ink-soft">
                      No upcoming test or paper, measured {MAINTENANCE_HORIZON_DAYS} days ahead
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="tabular-nums">{formatDate(paper.date, timeZone)}</span>
                      {paper.assessments.map((assessment) => (
                        <Button
                          key={assessment.id}
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelect(assessment.id)}
                          aria-label={`Show ${assessment.name}`}
                        >
                          {assessment.name}
                        </Button>
                      ))}
                    </span>
                  )}
                </th>
                <td className="px-3 py-3 text-right tabular-nums">{paper.cardCount}</td>
                <td className="py-3 pl-3 text-right font-display text-lg tabular-nums">
                  {percent(paper.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">
        {countOf(
          papers.reduce((total, paper) => total + paper.cardCount, 0),
          'card',
        )}{' '}
        in total, matching the headline. Unreviewed cards count as forgotten.
      </p>
    </SectionCard>
  );
}
