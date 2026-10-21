import { useId, useState } from 'react';
import { Select } from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';
import { setCourseStudyStartLesson } from '../../db/courseEntry';
import { useLessonOrderData } from '../../state/useLessonOrderData';

export function CourseEntrySection({ courseId }: { courseId: string }) {
  const data = useLessonOrderData(courseId);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  const pickerId = useId();
  const hintId = useId();
  const lessons = data?.lessons.filter((lesson) => !lesson.isExtension) ?? [];
  const savedId = data?.course.studyStartLessonId;
  const missing = !!savedId && !lessons.some((lesson) => lesson.id === savedId);

  async function change(value: string) {
    setSaving(true);
    try {
      await setCourseStudyStartLesson(courseId, value || undefined);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Could not change the starting lesson.',
        'negative',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start">
      <div className="min-w-0">
        <h3>
          <label htmlFor={pickerId} className="font-semibold text-ink">
            Start study from
          </label>
        </h3>
        <p id={hintId} className="mt-1 text-sm text-ink-soft">
          Joining part-way through? Choose your class’s current lesson. Earlier lessons stay open
          for catch-up and revision, and nothing is marked as completed. Only your copy changes.
        </p>
      </div>
      <Select
        id={pickerId}
        className="w-full"
        value={savedId ?? ''}
        disabled={!data || saving || data.course.archived}
        onChange={(event) => void change(event.target.value)}
        aria-describedby={hintId}
      >
        <option value="">Beginning of the course</option>
        {missing && <option value={savedId}>Starting lesson removed — using the beginning</option>}
        {lessons.map((lesson) => (
          <option key={lesson.id} value={lesson.id}>
            {lesson.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
