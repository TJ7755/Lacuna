import type { Course, Lesson } from '../db/types';
import { MS_PER_DAY } from '../fsrs/params';
import { courseLessonOrderPreference, resolveLessonOrder } from './lessonOrder';
import { earlierLessonIds } from './courseEntry';

/**
 * Computes the effective release date for every lesson under `linear` unlock mode.
 *
 * Walks core (non-extension) lessons in the effective course order:
 *   - Cursor starts at `course.linearCadence.anchorDate`.
 *   - If a lesson carries an explicit `releaseDate` override, the cursor is moved
 *     to it — cascading the change forward to every subsequent lesson.
 *   - The current cursor value is assigned to the lesson; the cursor then
 *     advances by `intervalDays × MS_PER_DAY`.
 *
 * Extension lessons are SKIPPED entirely: they neither consume a slot in the
 * walk (which would silently shift every subsequent date by one interval) nor
 * receive a date (they are always unlocked by addendum B).
 *
 * Returns `Map<lessonId, number | undefined>`:
 *   - Core lessons under a defined cadence → epoch-ms effective release date.
 *   - Core lessons when `linearCadence` is absent → `undefined` (treat as unlocked).
 *   - Extension lessons → `undefined` (always unlocked; date is irrelevant).
 */
export function lessonEffectiveReleaseDates(
  course: Course,
  lessons: Lesson[],
): Map<string, number | undefined> {
  const result = new Map<string, number | undefined>();
  const sorted = resolveLessonOrder(lessons, courseLessonOrderPreference(course));

  if (!course.linearCadence) {
    // No cadence defined: mark all lessons as unlocked (undefined = no gate).
    for (const lesson of sorted) {
      result.set(lesson.id, undefined);
    }
    return result;
  }

  let cursor = course.linearCadence.anchorDate;
  const intervalMs = course.linearCadence.intervalDays * MS_PER_DAY;

  for (const lesson of sorted) {
    if (lesson.isExtension) {
      // Extension lessons do not consume a slot; they receive no effective date.
      result.set(lesson.id, undefined);
      continue;
    }

    // An explicit override moves the cursor (cascades to every subsequent lesson).
    if (lesson.releaseDate !== undefined) {
      cursor = lesson.releaseDate;
    }

    result.set(lesson.id, cursor);
    cursor += intervalMs;
  }

  return result;
}

// ---------------------------------------------------------------------------
// 2. isLessonUnlocked
// ---------------------------------------------------------------------------

/**
 * Returns whether a lesson is currently accessible.
 *
 *  - **Extension lessons** (addendum B): always unlocked regardless of mode.
 *  - `open`: always unlocked.
 *  - `linear`: unlocked when `effectiveDate` is `undefined` (no cadence defined),
 *    or when `effectiveDate <= now`.
 *  - `semi-linear`: unlocked when `lesson.unlockedAt` is set (the one-way
 *    ratchet stored in Phase 6), OR when the lesson is the first core
 *    (non-extension) lesson in the effective course order, or within the chosen entry prefix.
 *    Later lessons remain locked until their ratchet is triggered.
 *
 * `effectiveDates` is the map returned by `lessonEffectiveReleaseDates`; it is
 * only consulted under `linear` mode. `lessons` must include all lessons in the
 * course so the entry-prefix check for `semi-linear` is correct.
 */
export function isLessonUnlocked(
  course: Course,
  lesson: Lesson,
  effectiveDates: Map<string, number | undefined>,
  lessons: Lesson[],
  now: number = Date.now(),
): boolean {
  return isLessonUnlockedWithInitialLessons(
    course,
    lesson,
    effectiveDates,
    initiallyUnlockedLessonIds(course, lessons),
    now,
  );
}

export function initiallyUnlockedLessonIds(course: Course, lessons: Lesson[]): ReadonlySet<string> {
  const sorted = resolveLessonOrder(lessons, courseLessonOrderPreference(course));
  const ids = earlierLessonIds(
    course.studyStartLessonId,
    lessons,
    sorted.map((lesson) => lesson.id),
    course.schoolCoveredLessonIds,
  );
  const start =
    sorted.find(
      (candidate) => candidate.id === course.studyStartLessonId && !candidate.isExtension,
    ) ?? sorted.find((candidate) => !candidate.isExtension);
  if (start) ids.add(start.id);
  return ids;
}

export function isLessonUnlockedWithInitialLessons(
  course: Course,
  lesson: Lesson,
  effectiveDates: Map<string, number | undefined>,
  initialLessonIds: ReadonlySet<string>,
  now: number,
): boolean {
  // Extension lessons are always unlocked (addendum B).
  if (lesson.isExtension) return true;

  switch (course.unlockMode) {
    case 'open':
      return true;

    case 'linear': {
      const effectiveDate = effectiveDates.get(lesson.id);
      // Undefined means no cadence was defined — treat as immediately available.
      if (effectiveDate === undefined) return true;
      return effectiveDate <= now;
    }

    case 'semi-linear': {
      // Stored ratchet: once unlocked, never re-locked (addendum I).
      if (lesson.unlockedAt !== undefined) return true;
      // The chosen entry point and its catch-up prefix need no completion evidence.
      return initialLessonIds.has(lesson.id);
    }

    default:
      // Defensive: treat unrecognised future modes as locked.
      return false;
  }
}
