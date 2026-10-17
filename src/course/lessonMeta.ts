// The lesson header's one-line summary, composed from real figures only. Parts
// that carry no information (no due cards, no exam) are left out.

export interface LessonMetaInput {
  learnt: number;
  total: number;
  noteCount: number;
  dueCount: number;
  /** Whole days until the nearest exam, when one is set. */
  daysToExam?: number;
}

export function lessonMetaParts({
  learnt,
  total,
  noteCount,
  dueCount,
  daysToExam,
}: LessonMetaInput): string[] {
  const parts = [
    `${learnt} of ${total} ${total === 1 ? 'card' : 'cards'} learnt`,
    `${noteCount} ${noteCount === 1 ? 'note' : 'notes'}`,
  ];
  if (dueCount > 0) parts.push(`${dueCount} due`);
  if (daysToExam !== undefined) {
    parts.push(daysToExam === 0 ? 'Exam today' : `Exam in ${daysToExam} ${daysToExam === 1 ? 'day' : 'days'}`);
  }
  return parts;
}
