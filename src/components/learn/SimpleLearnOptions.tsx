import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLessons } from '../../state/useCourseData';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

/** Keep optional passes tucked beneath the scheduled study choices. */
export function SimpleLearnOptions({
  courseId,
  initialLessonId = '',
}: {
  courseId: string;
  initialLessonId?: string;
}) {
  const [lessonId, setLessonId] = useState(initialLessonId);
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      className="border-t border-line pt-2"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        Simple Learn
      </summary>
      {expanded && (
        <SimpleLearnFields courseId={courseId} lessonId={lessonId} onLessonChange={setLessonId} />
      )}
    </details>
  );
}

function SimpleLearnFields({
  courseId,
  lessonId,
  onLessonChange,
}: {
  courseId: string;
  lessonId: string;
  onLessonChange: (id: string) => void;
}) {
  const lessons = useLessons(courseId);
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-3 pb-2 pt-1">
      <p className="text-sm text-ink-faint">
        Repeat until every card is correct. Answers update your review schedule.
      </p>
      <Select
        className="simple-learn-select w-full"
        aria-label="Simple Learn scope"
        value={lessonId}
        onChange={(event) => onLessonChange(event.target.value)}
        onKeyDown={(event) => {
          // Escape dismisses the picker before the surrounding Study sheet.
          if (event.key === 'Escape' && event.currentTarget.matches(':open')) {
            event.stopPropagation();
          }
        }}
        disabled={lessons === undefined}
      >
        <option value="">Whole course</option>
        {lessons?.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        size="lg"
        disabled={lessons === undefined}
        onClick={() =>
          navigate(
            lessonId
              ? `/lesson/${encodeURIComponent(lessonId)}/learn?mode=simple`
              : `/course/${encodeURIComponent(courseId)}/learn?mode=simple`,
          )
        }
      >
        Start Simple Learn
      </Button>
    </div>
  );
}
