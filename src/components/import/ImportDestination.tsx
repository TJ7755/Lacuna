import { useState } from 'react';
import { useCourses, useLessons } from '../../state/useCourseData';
import type { CardImportDestination } from '../../db/cardImport';
import type { CourseSchedulingMode } from '../../db/types';
import { CourseStudyTarget } from '../course/CourseStudyTarget';
import { defaultExamDate, getLocalTimeZone } from '../../utils/datetime';
import { canEditLessons } from '../../course/lessonViewMode';
import { Select } from '../ui/Select';
import { chosenStudyTarget } from '../../onboarding/onboardingState';

export function useImportDestination() {
  const [courseId, setCourseId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<CourseSchedulingMode>(
    () => chosenStudyTarget()?.mode ?? 'steady',
  );
  const [examDate, setExamDate] = useState(
    () => chosenStudyTarget()?.examDate ?? defaultExamDate(),
  );
  const [validDate, setValidDate] = useState(true);
  // Onboarding has just asked about the exam, so a new course takes that answer as it is.
  const [targetChosen] = useState(() => chosenStudyTarget() !== null);
  const [timeZone] = useState(getLocalTimeZone);
  const courses = useCourses();
  const lessons = useLessons(courseId || undefined);
  const courseExists = courses?.some(
    (course) => course.id === courseId && !course.archived && canEditLessons(course),
  );
  const lessonExists = lessons?.some((lesson) => lesson.id === lessonId);
  const destination: CardImportDestination | null = courseId
    ? !courseExists
      ? null
      : lessonId
        ? lessonExists
          ? { kind: 'existing', schedulingUnitId: lessonId }
          : null
        : title.trim()
          ? { kind: 'lesson', title, courseId }
          : null
    : title.trim() && (mode !== 'exam' || (validDate && Number.isFinite(examDate)))
      ? {
          kind: 'course',
          title,
          options:
            mode === 'exam'
              ? { schedulingMode: mode, examDate, timeZone }
              : { schedulingMode: mode },
        }
      : null;
  return {
    courseId,
    setCourseId,
    lessonId,
    setLessonId,
    title,
    setTitle,
    mode,
    targetChosen,
    setMode,
    examDate,
    setExamDate,
    setValidDate,
    timeZone,
    courses,
    lessons,
    destination,
  };
}

export function ImportDestination({ draft }: { draft: ReturnType<typeof useImportDestination> }) {
  return (
    <div className="import-destination">
      <label>
        Destination
        <Select
          className="h-12 w-full min-w-0"
          value={draft.courseId}
          onChange={(event) => {
            draft.setCourseId(event.target.value);
            draft.setLessonId('');
          }}
        >
          <option value="">New course</option>
          {draft.courses
            ?.filter((course) => !course.archived && canEditLessons(course))
            .map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
        </Select>
      </label>
      {draft.courseId && (
        <label>
          Lesson
          <Select
            className="h-12 w-full min-w-0"
            value={draft.lessonId}
            onChange={(event) => draft.setLessonId(event.target.value)}
          >
            <option value="">New lesson</option>
            {draft.lessons?.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {!draft.lessonId && (
        <label>
          {draft.courseId ? 'Lesson title' : 'Course title'}
          <input
            data-import-destination-title=""
            value={draft.title}
            onChange={(event) => draft.setTitle(event.target.value)}
          />
        </label>
      )}
      {!draft.courseId && !draft.targetChosen && (
        <CourseStudyTarget
          schedulingMode={draft.mode}
          setSchedulingMode={draft.setMode}
          examDate={draft.examDate}
          setExamDate={draft.setExamDate}
          setExamDateValid={draft.setValidDate}
          timeZone={draft.timeZone}
        />
      )}
    </div>
  );
}
