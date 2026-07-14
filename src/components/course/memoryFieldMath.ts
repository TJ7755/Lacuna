// Formerly the standfirst copy for the course/lesson headers (CoursePath,
// LessonView): one editorial sentence summarising what is fading, how
// memory is holding, and how long remains until the exam. Superseded by
// HeaderStats (src/components/course/HeaderStats.tsx), which renders the
// same inputs as a row of labelled stat pills. Kept here as a pure,
// independently testable function — no React, no database, same
// testable-pure convention as src/course/path.ts — in case sentence-form
// copy is wanted again.
// British English throughout.

export interface StandfirstInput {
  dueCount: number;
  masteryPct: number;
  daysToExam: number;
  totalCards: number;
  unseenCount: number;
}

/** One editorial sentence replacing the old stat-block row. */
export function fieldStandfirst({
  dueCount,
  masteryPct,
  daysToExam,
  totalCards,
  unseenCount,
}: StandfirstInput): string {
  if (totalCards === 0) return 'No cards yet — add some to start mapping this memory.';
  const days =
    daysToExam <= 0
      ? 'exam day is here'
      : daysToExam === 1
        ? '1 day to go'
        : `${daysToExam} days to go`;
  const due =
    dueCount === 0
      ? 'Nothing due right now'
      : `${dueCount} card${dueCount === 1 ? '' : 's'} fading and due now`;
  const unseen =
    unseenCount > 0
      ? `, ${unseenCount} still unmapped`
      : '';
  return `${due}${unseen}; mastery holding at ${masteryPct}% with ${days}.`;
}
