import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLessonOrderData } from '../../state/useLessonOrderData';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { ChevronDownIcon } from '../ui/icons';
import { cn } from '../ui/cn';

function dismissOpenSelect(event: KeyboardEvent<HTMLSelectElement>) {
  // Escape dismisses the picker before the surrounding options.
  if (event.key === 'Escape' && event.currentTarget.matches(':open')) {
    event.stopPropagation();
  }
}

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
  const [multipleChoice, setMultipleChoice] = useState(false);

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
          multipleChoice={multipleChoice}
          onMultipleChoiceChange={setMultipleChoice}
        />
      )}
    </details>
  );
}

function SimpleLearnFields({
  courseId,
  lessonId,
  onLessonChange,
  multipleChoice,
  onMultipleChoiceChange,
}: {
  courseId: string;
  lessonId: string;
  onLessonChange: (id: string) => void;
  multipleChoice: boolean;
  onMultipleChoiceChange: (enabled: boolean) => void;
}) {
  const lessons = useLessonOrderData(courseId)?.lessons;
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-3 pb-2 pt-1">
      <Select
        className="simple-learn-select w-full"
        aria-label="What to practise"
        value={lessonId}
        onChange={(event) => onLessonChange(event.target.value)}
        onKeyDown={dismissOpenSelect}
        disabled={lessons === undefined}
      >
        <option value="">Whole course</option>
        {lessons?.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </Select>
      <Select
        className="simple-learn-select w-full"
        aria-label="Answer format"
        value={multipleChoice ? 'multiple-choice' : 'recall'}
        onChange={(event) => onMultipleChoiceChange(event.target.value === 'multiple-choice')}
        onKeyDown={dismissOpenSelect}
      >
        <option value="recall">Recall (updates schedule)</option>
        <option value="multiple-choice">Multiple choice</option>
      </Select>
      <Button
        variant="secondary"
        size="lg"
        disabled={lessons === undefined}
        onClick={() => {
          const scope = lessonId
            ? `/lesson/${encodeURIComponent(lessonId)}`
            : `/course/${encodeURIComponent(courseId)}`;
          const format = multipleChoice ? '&format=multiple-choice' : '';
          void navigate(`${scope}/learn?mode=simple${format}`);
        }}
      >
        Start practising
      </Button>
    </div>
  );
}
