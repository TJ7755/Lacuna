import { useState } from 'react';
import { Select } from '../../components/ui/Select';
import { fieldLabelClassName } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { setCourseStudyStartLesson } from '../../db/courseEntry';
import { useLessonOrderData } from '../../state/useLessonOrderData';

export function CourseEntrySection({ courseId }: { courseId: string }) {
  const data = useLessonOrderData(courseId);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
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
    <div className="space-y-3">
      <label className={fieldLabelClassName}>
        Start Study from
        <Select
          className="mt-2 w-full"
          value={savedId ?? ''}
          disabled={!data || saving || data.course.archived}
          onChange={(event) => void change(event.target.value)}
          aria-describedby="course-entry-hint"
        >
          <option value="">Beginning of the course</option>
          {missing && (
            <option value={savedId}>Starting lesson removed — using the beginning</option>
          )}
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </Select>
      </label>
      <p id="course-entry-hint" className="text-sm text-ink-soft">
        Joining part-way through? Choose your class’s current lesson. Earlier lessons stay available
        for catch-up and their cards enter Review earlier material and exam revision. Your answers
        establish what you remember; nothing is marked completed or mastered.
      </p>
      <p className="text-xs text-ink-faint">
        This applies to your copy only. Later lessons keep their usual unlocking rules and dates.
      </p>
    </div>
  );
}
