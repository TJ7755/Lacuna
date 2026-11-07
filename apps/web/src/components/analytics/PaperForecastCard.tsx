import { useId } from 'react';
import type { PaperForecast } from '../../course/courseProgress';
import { formatDate } from '../../utils/datetime';
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
  informational = false,
  objectiveLabel,
  timeZone,
  onSelect,
}: {
  papers: PaperForecast[];
  informational?: boolean;
  objectiveLabel: string;
  timeZone?: string;
  onSelect: (assessmentId: string) => void;
}) {
  const titleId = useId();
  return (
    <SectionCard aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-2xl">
        {informational ? 'Later paper forecasts' : 'Forecast by paper'}
      </h2>
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
              <tr key={paper.assessments.map(({ id }) => id).join(',') || paper.date || 'undated'}>
                <th scope="row" className="py-3 pr-3 font-normal">
                  {paper.date === undefined ? (
                    <span className="text-ink-soft">
                      No date · {MAINTENANCE_HORIZON_DAYS}-day forecast
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
    </SectionCard>
  );
}
