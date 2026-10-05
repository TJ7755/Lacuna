import type { Course } from '../../db/types';
import { formatDate } from '../../utils/datetime';

/**
 * A quiet hint for why a locked lesson isn't available yet, shown beside it on the
 * course list. `open` mode never locks anything, so it has no hint; `linear` names
 * the release date; `semi-linear`'s ratchet has no single stored trigger to point
 * at, so it names the mechanism in general terms.
 */
export function lockHintFor(
  course: Course,
  lessonId: string,
  effectiveDates: Map<string, number | undefined>,
): string | undefined {
  switch (course.unlockMode) {
    case 'linear': {
      const date = effectiveDates.get(lessonId);
      return date ? `Unlocks ${formatDate(date, course.timeZone)}` : undefined;
    }
    case 'semi-linear':
      return 'Unlocks once the lesson before it is complete';
    default:
      return undefined;
  }
}
