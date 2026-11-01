import { db } from './schema';
import { readLessonViewMode } from '../state/lessonViewMode';

/** Preserve the retired global view preference without loading Course write operations at startup. */
export async function stampMissingLessonViewModes(): Promise<void> {
  const globalDefault = readLessonViewMode();
  const unstamped = await db.courses
    .filter((course) => course.lessonViewMode === undefined)
    .toArray();
  if (unstamped.length === 0) return;
  await db.courses.bulkUpdate(
    unstamped.map((course) => ({ key: course.id, changes: { lessonViewMode: globalDefault } })),
  );
}
