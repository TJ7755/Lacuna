import { db } from '../db/schema';

interface EntityAvailabilityReference {
  kind: 'course' | 'lesson' | 'card' | 'concept' | 'question' | 'assessment';
  id: string;
  courseId?: string;
}

export async function aiEntityExists(reference: EntityAvailabilityReference): Promise<boolean> {
  if (reference.kind === 'course') {
    return reference.id === '__global__' || (await db.courses.get(reference.id)) !== undefined;
  }

  const record =
    reference.kind === 'lesson'
      ? await db.lessons.get(reference.id)
      : reference.kind === 'card'
        ? await db.cards.get(reference.id)
        : reference.kind === 'concept'
          ? await db.concepts.get(reference.id)
          : reference.kind === 'question'
            ? await db.questions.get(reference.id)
            : await db.courseAssessments.get(reference.id);

  if (!record) return false;
  return reference.courseId === undefined || record.courseId === reference.courseId;
}
