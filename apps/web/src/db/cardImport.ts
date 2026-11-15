import { db } from './schema';
import { prepareCards, canReverseCardDraft } from './cardRepository';
import { createCourse } from './courseRepository';
import { createLesson } from './lessonRepository';
import { importApkgResult, type ApkgImportResult } from './apkgImport';
import type { ParsedCard } from './import';
import type { Lesson } from '@lacuna/core/db/types';
import { requireEditableImportCourse, requireEditableImportUnit } from './cardImportDestination';

export const MAX_IMPORT_CARDS = 5000;
export const MAX_IMPORT_CHARS = 500_000;
export type CardImportContent =
  | { kind: 'text'; cards: ParsedCard[]; reverse: boolean }
  | { kind: 'apkg'; result: ApkgImportResult };
export type CardImportDestination =
  | { kind: 'course'; title: string; options: Parameters<typeof createCourse>[1] }
  | { kind: 'lesson'; title: string; courseId: string }
  | { kind: 'existing'; schedulingUnitId: string };

export const canReverseImportCard = canReverseCardDraft;

export function importCardCount(content: CardImportContent): number {
  return content.kind === 'apkg'
    ? content.result.cards.length
    : content.cards.length +
        (content.reverse ? content.cards.filter(canReverseImportCard).length : 0);
}

/** Extend bulk creation with reverse presentations, preserving each pair's Concept. */
export async function createImportedCards(unitId: string, cards: ParsedCard[], reverse = false) {
  const commit = await prepareCards(cards, reverse);
  return commit(unitId);
}

/** New destinations and card records commit together. Media is ingested by the APKG importer first. */
export async function importCardsToDestination(
  destination: CardImportDestination,
  content: CardImportContent,
) {
  const count = importCardCount(content);
  if (count === 0 || count > MAX_IMPORT_CARDS)
    throw new Error(`Import between 1 and ${MAX_IMPORT_CARDS.toLocaleString()} cards.`);
  if (destination.kind !== 'existing' && !destination.title.trim())
    throw new Error('Enter a title.');
  // A first dynamic validator load can outlive a Dexie transaction.
  const commit =
    content.kind === 'text' ? await prepareCards(content.cards, content.reverse) : undefined;
  let lesson: Lesson | undefined;
  let courseId = '';
  async function resolveTarget() {
    if (destination.kind === 'existing') {
      const unit = await requireEditableImportUnit(destination.schedulingUnitId);
      courseId = unit.courseId!;
      return unit.id;
    }
    if (destination.kind === 'course') {
      const course = await createCourse(destination.title.trim(), destination.options);
      courseId = course.id;
      lesson = await createLesson(course.id, 'Lesson 1');
    } else {
      const course = await requireEditableImportCourse(destination.courseId);
      courseId = course.id;
      lesson = await createLesson(course.id, destination.title.trim());
    }
    return lesson.id;
  }
  if (content.kind === 'apkg') {
    await importApkgResult(content.result, resolveTarget);
  } else {
    await db.transaction(
      'rw',
      [
        db.courses,
        db.lessons,
        db.courseAssessments,
        db.schedulingUnits,
        db.coursePerformance,
        db.schedulingPerformance,
        db.cards,
        db.concepts,
      ],
      async () => {
        const target = await resolveTarget();
        await commit!(target);
      },
    );
  }
  return { courseId, lesson, count };
}
