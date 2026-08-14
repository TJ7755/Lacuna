// Lesson view page — a study destination first, notes/cards second. The
// second half renders in one of two modes, resolved by
// src/course/lessonViewMode.ts: study (read-only notes, a cards summary) or
// edit (full notes/cards CRUD), driven by the course's own
// Course.lessonViewMode.
// Route: /course/:courseId/lesson/:lessonId
// Also renderable inline by CoursePath when a course has exactly one lesson
// (via optional courseId/lessonId props that take precedence over route params).
// British English throughout.

import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/schema';
import {
  useCourse,
  useNotes,
  useLessonCards,
  useLessons,
  useCourseAssessments,
  useLessonBackingDeck,
} from '../state/useCourseData';
import { LessonNotesSection } from '../components/notes/LessonNotesSection';
import { LessonNotesStudyView } from '../components/notes/LessonNotesStudyView';
import { LessonCardsSection } from '../components/cards/LessonCardsSection';
import { LessonCardsSummary } from '../components/cards/LessonCardsSummary';
import { ChevronLeftIcon, PlayIcon } from '../components/ui/icons';
import { Button } from '../components/ui/Button';
import { AddLessonControl } from '../components/course/AddLessonControl';
import { CourseTabs } from '../components/course/CourseTabs';
import { CourseHeader } from '../components/course/CourseHeader';
import { LessonViewModeToggle } from '../components/course/LessonViewModeToggle';
import { HeaderStats } from '../components/course/HeaderStats';
import { courseHeaderStats } from '../course/headerStats';
import { canEditLessons, isLessonAuthoringMode, resolveLessonViewMode } from '../course/lessonViewMode';
import { progressValue } from '../fsrs/objective';
import { MS_PER_DAY } from '../fsrs/params';
import { updateCourse, updateLesson } from '../db/repository';
import { formatDate } from '../utils/datetime';
import type { Lesson } from '../db/types';
import { useToast } from '../components/ui/Toast';

interface LessonViewProps {
  /**
   * When provided (inline single-lesson branch from CoursePath), takes precedence
   * over the route param. The back link also changes to the dashboard rather than
   * the course path, since there is no path to go back to.
   */
  courseId?: string;
  /** Same precedence rule as courseId above. */
  lessonId?: string;
  /** The single course-level Study action for the inline one-lesson course. */
  showStudyNow?: boolean;
}

export function LessonView({
  courseId: courseIdProp,
  lessonId: lessonIdProp,
  showStudyNow = false,
}: LessonViewProps) {
  const params = useParams<{ courseId: string; lessonId: string }>();
  // Props take precedence over route params (single-lesson inline branch).
  const courseId = courseIdProp ?? params.courseId;
  const lessonId = lessonIdProp ?? params.lessonId;
  // The component is rendered inline when props were supplied by CoursePath.
  const isInline = courseIdProp !== undefined;

  const navigate = useNavigate();
  const { notify } = useToast();

  // Use a null-sentinel to distinguish loading (undefined) from not found (null).
  // When lessonId is absent the query resolves immediately to null.
  const lesson = useLiveQuery<Lesson | null>(
    () => (lessonId ? db.lessons.get(lessonId).then((l) => l ?? null) : Promise.resolve(null)),
    [lessonId],
  );
  const course = useCourse(courseId);
  const lessons = useLessons(courseId);
  const examDates = useCourseAssessments(courseId);
  const notes = useNotes(lessonId);
  const lessonCards = useLessonCards(lessonId);

  // Resolve the hidden scheduling deck through the Course/Lesson data boundary.
  // Card membership remains independent from the scheduling implementation.
  const lessonDeck = useLessonBackingDeck(courseId, lessonId);

  // Loading state.
  if (
    lesson === undefined ||
    course === undefined ||
    lessons === undefined ||
    examDates === undefined ||
    notes === undefined ||
    lessonCards === undefined
  ) {
    return (
      <DelayedFallback>
        <LessonViewSkeleton />
      </DelayedFallback>
    );
  }

  // Not found.
  if (lesson === null || course === null) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-line bg-surface p-10"
      >
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative">
          <p className="mb-4 text-ink-soft">
            {lesson === null
              ? 'This lesson could not be found.'
              : 'This course could not be found.'}
          </p>
          <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent underline">
            {courseId ? 'Back to course' : 'Back to dashboard'}
          </Link>
        </div>
      </div>
    );
  }

  // Back link: course path when navigating normally; dashboard when rendered inline
  // for a single-lesson course (no path to navigate back to).
  const backTo = isInline ? '/' : `/course/${courseId}`;
  const backLabel = isInline ? 'Dashboard' : 'Course';

  // Header stats, scoped to this lesson's own cards (reusing the same FSRS
  // helpers CoursePath uses at course scope — see CoursePath.tsx and
  // fsrs/eligibility.ts, fsrs/objective.ts).
  const now = Date.now();
  const lessonMastery = progressValue(lessonCards, course, now);
  const {
    nearestExam,
    examUrgent,
    dueCardCount: lessonDueCount,
  } = courseHeaderStats(course, examDates, lessonCards, lessonMastery, now);
  const viewMode = resolveLessonViewMode(course);
  const authoring = isLessonAuthoringMode(course);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      {/* Breadcrumb */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to={backTo}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-faint transition-colors hover:text-ink active:text-ink"
        >
          <ChevronLeftIcon width={16} height={16} />
          {backLabel}
        </Link>
        {courseId && <CourseTabs courseId={courseId} />}
      </div>
      {isInline && courseId && (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-4">
          <div className="flex items-center gap-4">
            {authoring && (
              <AddLessonControl
                courseId={courseId}
                lessonCount={lessons.length}
                onCreated={(createdLesson) =>
                  navigate(`/course/${courseId}/lesson/${createdLesson.id}`)
                }
              />
            )}
            {!canEditLessons(course) ? (
              <Link
                to={`/course/${courseId}/settings`}
                className="text-xs text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
              >
                Editing is locked for shared courses
              </Link>
            ) : (
              <LessonViewModeToggle
                mode={viewMode}
                onChange={(mode) => void updateCourse(course.id, { lessonViewMode: mode })}
              />
            )}
          </div>
        </div>
      )}

      {/* Header — title, a row of labelled stat pills (HeaderStats), and the
          Study action. */}
      <CourseHeader
        className="mb-8"
        eyebrow={`Exam ${formatDate(nearestExam, course.timeZone)}`}
        examUrgent={examUrgent}
        title={lesson.name}
        onRename={
          authoring
            ? async (name) => {
                try {
                  await updateLesson(lesson.id, { name });
                } catch (error) {
                  notify(
                    error instanceof Error ? error.message : 'Could not rename the lesson.',
                    'negative',
                  );
                  throw error;
                }
              }
            : undefined
        }
        renameLabel="lesson"
      >
        <div>
          <HeaderStats
            dueCount={lessonDueCount}
            masteryPct={Math.round(lessonMastery * 100)}
            daysToExam={Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0)}
            totalCards={lessonCards.length}
            unseenCount={lessonCards.filter((c) => c.lastReviewed === null || c.state === 0).length}
          />
          {showStudyNow && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate(`/course/${courseId}/study`)}
              >
                <PlayIcon width={18} height={18} />
                Study
              </Button>
              {/* The due count already leads the stat pills above, so this line
                only speaks when there is something the pills don't say. */}
              {(lessonCards.length === 0 || lessonDueCount === 0) && (
                <p className="text-sm text-ink-faint">
                  {lessonCards.length === 0
                    ? 'Add cards to begin studying.'
                    : 'Nothing due — next lesson available.'}
                </p>
              )}
            </div>
          )}
        </div>
      </CourseHeader>
      {lesson.description && <p className="mb-8 text-sm text-ink-soft">{lesson.description}</p>}

      {/* ------------------------------------------------------------------ */}
      {/* Notes and cards. Demoted below the study CTA: a quieter, smaller-   */}
      {/* heading section either way. In edit mode this is the full CRUD     */}
      {/* editor (LessonNotesSection/LessonCardsSection); in study mode it   */}
      {/* is read-only content plus a cards summary — see                    */}
      {/* src/course/lessonViewMode.ts for how the mode is resolved.         */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="space-y-10 border-t border-line pt-8"
      >
        {viewMode === 'edit' ? (
          <>
            {lessonId && <LessonNotesSection lessonId={lessonId} notes={notes} />}

            {courseId && lessonId && (
              <LessonCardsSection
                courseId={courseId}
                lessonId={lessonId}
                lessonName={lesson.name}
                lessonCards={lessonCards}
                lessonSchedulingConfig={lessonDeck}
                onNavigate={navigate}
              />
            )}
          </>
        ) : (
          <>
            <LessonNotesStudyView notes={notes} />
            <LessonCardsSummary
              cardCount={lessonCards.length}
              dueCount={lessonDueCount}
              masteryPct={Math.round(lessonMastery * 100)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function LessonViewSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <div className="mb-6 h-4 w-20 animate-pulse rounded bg-ink/10" />
      <div className="mb-8 flex flex-col gap-4 md:flex-row">
        <div className="h-40 flex-1 animate-pulse rounded-2xl bg-ink/10" />
        <div className="h-40 animate-pulse rounded-2xl bg-ink/10 md:w-56" />
      </div>
      <div className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-7 w-16 animate-pulse rounded bg-ink/10" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-ink/10" />
        </div>
        <div className="space-y-px rounded-xl border border-line">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-3">
              <div className="h-4 w-4 animate-pulse rounded bg-ink/10" />
              <div className="h-4 flex-1 animate-pulse rounded bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-4 h-7 w-20 animate-pulse rounded bg-ink/10" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-line bg-ink/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
