import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLessonOrderData } from '../../state/useLessonOrderData';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ChevronDownIcon } from '../ui/icons';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { cn } from '../ui/cn';

/** Keep optional passes tucked beneath the scheduled study choices. */
export function SimpleLearnOptions({
  courseId,
  initialLessonId = '',
  className,
}: {
  courseId: string;
  initialLessonId?: string;
  className?: string;
}) {
  const [lessonId, setLessonId] = useState(initialLessonId);
  const [expanded, setExpanded] = useState(false);

  if (initialLessonId)
    return (
      <div className={cn('border-t border-line pt-4', className)}>
        <ExpandingCreateControl
          label="Practise until all correct"
          closedWidth={240}
          showIcon={false}
          align="start"
          open={expanded}
          onOpenChange={setExpanded}
        >
          <SimpleLearnFields
            courseId={courseId}
            lessonId={lessonId}
            fixedLesson={Boolean(initialLessonId)}
            onLessonChange={setLessonId}
          />
        </ExpandingCreateControl>
      </div>
    );
  return (
    <details
      className={cn('border-t border-line pt-2', className)}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-3 text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink [&::-webkit-details-marker]:hidden">
        Practise until all correct
        <ChevronDownIcon
          width={16}
          height={16}
          aria-hidden="true"
          className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </summary>
      {expanded && (
        <SimpleLearnFields
          courseId={courseId}
          lessonId={lessonId}
          onLessonChange={setLessonId}
          fixedLesson={false}
        />
      )}
    </details>
  );
}

function SimpleLearnFields({
  courseId,
  lessonId,
  onLessonChange,
  fixedLesson,
}: {
  courseId: string;
  lessonId: string;
  onLessonChange: (id: string) => void;
  fixedLesson: boolean;
}) {
  const lessons = useLessonOrderData(courseId)?.lessons;
  const navigate = useNavigate();
  return (
    <div className={cn('flex flex-col gap-3', fixedLesson ? 'p-5' : 'pb-2 pt-1')}>
      <p className="text-sm text-ink-faint">Answers update your review schedule.</p>
      {!fixedLesson && (
        <Select
          className="simple-learn-select w-full"
          aria-label="What to practise"
          value={lessonId}
          onChange={(event) => onLessonChange(event.target.value)}
          onKeyDown={(event) => {
            // Escape dismisses the picker before the surrounding options.
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
      )}
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
        Start practising
      </Button>
    </div>
  );
}
