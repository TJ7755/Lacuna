import type { ConceptPracticeItem } from '../questions/conceptPractice';
import { SCIENCE_TECHNIQUES, type TechniqueId } from '../questions/techniqueTags';

// Exam-question evidence for a Progress scope, read from the same per-Concept diagnostic
// aggregates that select practice. Knowledge, application and each technique stay separate
// counts of marked answers; nothing here becomes a percentage, a mark or Card recall.

export interface QuestionEvidenceRow {
  id: 'knowledge' | 'application' | TechniqueId;
  name: string;
  /** Answers, counted once per topic, that showed this category without a gap. */
  demonstrated: number;
  /** Answers, counted once per topic, that showed a gap in this category. */
  gaps: number;
  /** Topics whose latest marked answer showed a gap here. */
  topicsWithGap: number;
}

export interface QuestionEvidenceReport {
  /** Course topics in scope; Concepts outside the course's own topics are not counted. */
  topics: number;
  topicsWithEvidence: number;
  rows: QuestionEvidenceRow[];
}

const CATEGORIES: ReadonlyArray<{ id: QuestionEvidenceRow['id']; name: string }> = [
  { id: 'knowledge', name: 'Knowledge' },
  { id: 'application', name: 'Application' },
  ...SCIENCE_TECHNIQUES.map((skill) => ({ id: skill.id, name: skill.name })),
];

export function buildQuestionEvidence(
  practice: ReadonlyArray<Pick<ConceptPracticeItem, 'conceptId' | 'diagnosticEvidence'>>,
  conceptIds: readonly string[],
): QuestionEvidenceReport {
  const scope = new Set(conceptIds);
  const items = practice.filter((item) => scope.has(item.conceptId));
  const rows = CATEGORIES.flatMap((category): QuestionEvidenceRow[] => {
    let demonstrated = 0;
    let gaps = 0;
    let topicsWithGap = 0;
    for (const item of items) {
      const evidence = item.diagnosticEvidence?.find((row) => row.categoryId === category.id);
      if (!evidence) continue;
      demonstrated += evidence.demonstratedCount;
      gaps += evidence.gapCount;
      if (evidence.latestOutcome === 'gap') topicsWithGap++;
    }
    return demonstrated + gaps > 0
      ? [{ id: category.id, name: category.name, demonstrated, gaps, topicsWithGap }]
      : [];
  });
  return {
    topics: items.length,
    topicsWithEvidence: items.filter((item) => item.diagnosticEvidence?.length).length,
    rows,
  };
}
