import { useId } from 'react';
import type { LessonProgress } from '../../course/courseProgress';
import { cn } from '../ui/cn';
import { PathIcon } from '../ui/icons';
import { SectionCard } from '../ui/SectionCard';

/**
 * Every lesson in scope as one square, shaded by predicted recall in path order. A dashed
 * square has no counted cards, which is not the same as 0%.
 */
export function LessonStrip({ lessons }: { lessons: LessonProgress[] }) {
  const titleId = useId();
  if (lessons.length === 0) return null;
  return (
    <SectionCard aria-labelledby={titleId} compact className="flex flex-col gap-3">
      <h2 id={titleId} className="flex items-center gap-2 font-display text-2xl">
        <PathIcon width={20} height={20} className="text-ink-soft" aria-hidden="true" />
        Lessons
      </h2>
      <ul className="flex flex-wrap gap-1">
        {lessons.map((lesson) => {
          const name = `${lesson.name}: ${
            lesson.value === null ? 'no cards' : `${Math.round(lesson.value * 100)}%`
          }`;
          return (
            <li
              key={lesson.lessonId}
              title={name}
              className={cn(
                'size-7 rounded-md',
                lesson.value === null ? 'border border-dashed border-line' : 'bg-accent',
              )}
              style={lesson.value === null ? undefined : { opacity: 0.12 + lesson.value * 0.88 }}
            >
              <span className="sr-only">{name}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
