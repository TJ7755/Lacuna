import { useId } from 'react';
import type { QuestionEvidenceReport } from '../../course/questionEvidence';
import { countOf } from '../../utils/plural';
import { SectionCard } from '../ui/SectionCard';

/**
 * Marked exam-question answers in the Progress scope, by what they showed. Kept apart from
 * predicted recall: these are counts of evidence, not a score or a forecast.
 */
export function QuestionEvidenceCard({ evidence }: { evidence: QuestionEvidenceReport }) {
  const titleId = useId();
  return (
    <SectionCard aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-2xl">
          Exam-question evidence
        </h2>
        <p className="text-sm text-ink-soft">
          {evidence.topics === 0
            ? 'No topics in this scope yet.'
            : `${evidence.topicsWithEvidence} of ${countOf(evidence.topics, 'topic')} ${
                evidence.topicsWithEvidence === 1 ? 'has' : 'have'
              } marked answers.`}
        </p>
      </div>
      {evidence.rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No independently marked answers yet. A topic without answers is not counted as a gap.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table
            aria-label="Exam-question evidence by category"
            className="w-full text-left text-sm"
          >
            <thead className="text-xs text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Shown in answers
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Secure
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Gap
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Topics to work on
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {evidence.rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="py-3 pr-3 font-normal">
                    {row.name}
                  </th>
                  <td className="px-3 py-3 text-right tabular-nums">{row.demonstrated}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.gaps}</td>
                  <td className="py-3 pl-3 text-right tabular-nums">{row.topicsWithGap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Knowledge and technique are judged separately for each marked answer, counted once per
        topic. Answers with help, corrections, disputed marks or an unsure diagnosis are left out. A
        topic is to work on when its latest answer showed a gap. These counts never change card
        recall.
      </p>
    </SectionCard>
  );
}
