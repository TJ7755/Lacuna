import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { Skeleton } from '../components/ui/Skeleton';
import { QuestionSetPathEditor } from '../components/course/QuestionSetPathEditor';
import { RelatedQuestionSets } from '../components/question-sets/RelatedQuestionSets';
// Lesson view page — a study destination first, notes/cards second. A header
// (title, one meta line, a Study/Edit pill and the study action) sits above a large
// reading card for the notes beside a compact "Cards in this lesson" list. The
// workspace renders in one of two modes, resolved by src/course/lessonViewMode.ts:
// View (read-only) or Edit (the same layout with edit controls faded in, and
// the full card management section revealed beneath), driven by the course's own
// Course.lessonViewMode.
// Route: /course/:courseId/lesson/:lessonId
// Also renderable inline by CoursePath when a course has exactly one lesson
// (via optional courseId/lessonId props that take precedence over route params).
// British English throughout.

import { useRef, useState } from 'react';
import { DelayedFallback } from '../components/ui/DelayedFallback';
import { useLiveQuery } from 'dexie-react-hooks';
import { m as motion } from 'motion/react';
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
import { LessonNotesCard } from '../components/notes/LessonNotesCard';
import { LessonCardsSection } from '../components/cards/LessonCardsSection';
import { LessonCardsList } from '../components/cards/LessonCardsList';
import { learntCardCount } from '../components/cards/lessonCardRow';
import { PlayIcon } from '../components/ui/icons';
import { Button } from '../components/ui/Button';
import { AnimatedDisclosure } from '../components/ui/AnimatedDisclosure';
import { riseIn } from '../components/course/riseIn';
import { AddLessonControl } from '../components/course/AddLessonControl';
import { AddCourseControl } from '../components/course/AddCourseControl';
import { CoursePageNavigation } from '../components/course/CoursePageNavigation';
import { LessonHeader } from '../components/course/LessonHeader';
import { ArchivedCourseRestoreNotice } from '../components/course/ArchivedCourseState';
import { courseHeaderStats } from '../course/headerStats';
import { lessonMetaParts } from '../course/lessonMeta';
import {
  canEditLessons,
  isLessonAuthoringMode,
  resolveLessonViewMode,
} from '../course/lessonViewMode';
import { progressValue } from '../fsrs/objective';
import { MS_PER_DAY } from '../fsrs/params';
import { updateLesson } from '../db/lessonRepository';
import type { Lesson } from '../db/types';
import { useToast } from '../components/ui/Toast';
import { SimpleLearnOptions } from '../components/learn/SimpleLearnOptions';
import { usePageShortcuts } from '../hooks/usePageShortcuts';
import { speedMultiplier, useMotionSpeed } from '../state/motionSpeed';

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
  onStudy?: () => void;
  /** Whether the inline one-lesson course has reached cards eligible for immediate practice. */
  practiceNowEnabled?: boolean;
  /** Opens path-native manual-practice creation for an inline one-lesson course. */
  onAddPractice?: () => void;
  /** Opens path-native checkpoint creation for an inline one-lesson course. */
  onAddCheckpoint?: () => void;
}

export function LessonView({
  courseId: courseIdProp,
  lessonId: lessonIdProp,
  showStudyNow = false,
  onStudy,
  practiceNowEnabled = false,
  onAddPractice,
  onAddCheckpoint,
}: LessonViewProps) {
  const params = useParams<{ courseId: string; lessonId: string }>();
  // Props take precedence over route params (single-lesson inline branch).
  const courseId = courseIdProp ?? params.courseId;
  const lessonId = lessonIdProp ?? params.lessonId;
  // The component is rendered inline when props were supplied by CoursePath.
  const isInline = courseIdProp !== undefined;

  const navigate = useNavigate();
  const { notify } = useToast();
  const [motionSpeed] = useMotionSpeed();
  const motionMultiplier = speedMultiplier(motionSpeed);
  const [addingLesson, setAddingLesson] = useState(false);
  const [addingQuestionSet, setAddingQuestionSet] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const restoreAdd = () => {
    setAddingLesson(false);
    addRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

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

  const shortcutArchived = course?.archived === true;
  usePageShortcuts({
    s: shortcutArchived
      ? undefined
      : showStudyNow
        ? (onStudy ?? (() => navigate(`/course/${courseId}/study`)))
        : !isInline && lessonCards && lessonCards.length > 0
          ? () => navigate(`/lesson/${encodeURIComponent(lessonId ?? '')}/learn`)
          : undefined,
    n:
      courseId &&
      lessonId &&
      course &&
      !shortcutArchived &&
      isLessonAuthoringMode(course) &&
      resolveLessonViewMode(course) === 'edit'
        ? () => navigate(`/course/${courseId}/lesson/${lessonId}/cards/new`)
        : undefined,
  });

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
      <div className={`${COURSE_PAGE_FRAME} py-8`}>
        <div className="rounded-3xl bg-surface p-10 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]">
          <p className="mb-4 text-ink-soft">
            {lesson === null
              ? 'This lesson could not be found.'
              : 'This course could not be found.'}
          </p>
          <Link to={courseId ? `/course/${courseId}` : '/'} className="text-accent-ink underline">
            {courseId ? 'Back to course' : 'Back to Today'}
          </Link>
        </div>
      </div>
    );
  }

  // Back link: course path when navigating normally; dashboard when rendered inline
  // for a single-lesson course (no path to navigate back to).
  const archived = course.archived === true;
  const backTo = archived ? '/archived' : isInline ? '/' : `/course/${courseId}`;
  const backLabel = archived ? 'Archived courses' : isInline ? 'Today' : 'Course';

  // Header figures, scoped to this lesson's own cards (reusing the same FSRS
  // helpers CoursePath uses at course scope — see CoursePath.tsx and
  // fsrs/eligibility.ts, fsrs/objective.ts).
  const now = Date.now();
  const lessonMastery = progressValue(lessonCards, course, now);
  const {
    nearestExam,
    examUrgent,
    dueCardCount: lessonDueCount,
  } = courseHeaderStats(course, examDates, lessonCards, lessonMastery, now, lessons);
  const viewMode = archived ? 'study' : resolveLessonViewMode(course);
  const authoring = !archived && isLessonAuthoringMode(course);
  const metaParts = lessonMetaParts({
    learnt: learntCardCount(lessonCards),
    total: lessonCards.length,
    noteCount: notes.length,
    dueCount: lessonDueCount,
    daysToExam:
      nearestExam === undefined
        ? undefined
        : Math.max(Math.ceil((nearestExam - now) / MS_PER_DAY), 0),
  });
  const lessonStudyPath = `/lesson/${encodeURIComponent(lesson.id)}/learn`;

  return (
    <div className={`${COURSE_PAGE_FRAME} ${isInline ? 'pb-8' : 'py-8'}`}>
      {!isInline && (
        <CoursePageNavigation
          courseId={courseId ?? ''}
          course={course}
          backTo={backTo}
          backLabel={backLabel}
          archived={archived}
          identity={archived ? undefined : { name: course.name }}
          className="mb-6"
          trailing={
            archived || canEditLessons(course) ? undefined : (
              <Link
                to={`/course/${courseId}/settings`}
                className="hidden text-xs text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink sm:inline"
              >
                Authoring is locked for shared courses
              </Link>
            )
          }
        />
      )}
      {isInline && courseId && authoring && (
        <div className="mb-6 flex flex-col gap-3">
          <div ref={addRef} role="group" aria-label="Add to path" className="flex justify-end">
            <AddCourseControl
              kinds={[
                'lesson',
                ...(onAddPractice ? (['practice'] as const) : []),
                'question-set',
                ...(onAddCheckpoint ? (['checkpoint'] as const) : []),
              ]}
              onAdd={(kind) => {
                if (kind === 'lesson') setAddingLesson(true);
                else if (kind === 'practice') onAddPractice?.();
                else if (kind === 'question-set') setAddingQuestionSet(true);
                else onAddCheckpoint?.();
              }}
            />
          </div>
          <AnimatedDisclosure open={addingLesson}>
            <AddLessonControl
              initiallyOpen
              courseId={courseId}
              lessonCount={lessons.length}
              onCancel={restoreAdd}
              onCreated={(createdLesson) =>
                navigate(`/course/${courseId}/lesson/${createdLesson.id}`)
              }
            />
          </AnimatedDisclosure>
          {addingQuestionSet && (
            <QuestionSetPathEditor
              courseId={courseId}
              afterLessonId={lesson.id}
              onClose={() => setAddingQuestionSet(false)}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-6">
        <motion.div {...riseIn(0, motionMultiplier)}>
          <LessonHeader
            title={lesson.name}
            description={lesson.description || undefined}
            meta={
              <span className={examUrgent ? 'text-warning-fg' : undefined}>
                {metaParts.join(' · ')}
              </span>
            }
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
          >
            {archived ? (
              <ArchivedCourseRestoreNotice />
            ) : showStudyNow ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onStudy ?? (() => navigate(`/course/${courseId}/study`))}
                >
                  <PlayIcon width={18} height={18} />
                  Study
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="border-[1.5px] border-ink bg-transparent"
                  disabled={!practiceNowEnabled}
                  onClick={() => navigate(`/course/${courseId}/study?review=due`)}
                >
                  Practice Now
                </Button>
              </>
            ) : isInline ? null : (
              <Button
                variant="primary"
                size="lg"
                disabled={lessonCards.length === 0}
                onClick={() => navigate(lessonStudyPath)}
              >
                <PlayIcon width={18} height={18} />
                Study
              </Button>
            )}
          </LessonHeader>
          {/* The due count already leads the meta line, so this only speaks when
              there is something it does not say. */}
          {!archived && showStudyNow && (lessonCards.length === 0 || lessonDueCount === 0) && (
            <p className="mt-3 text-sm text-ink-faint">
              {lessonCards.length === 0 ? 'Add cards to begin studying.' : 'Nothing due right now.'}
            </p>
          )}
        </motion.div>

        {/* Notes and cards. The two columns are identical in both modes; Edit mode
            fades the edit controls in place and reveals card management beneath. */}
        <div data-lesson-workspace-mode={viewMode} className="flex flex-col gap-6">
          <motion.div {...riseIn(1, motionMultiplier)} className="flex flex-wrap items-start gap-6">
            {lessonId && (
              <LessonNotesCard
                lessonId={lessonId}
                notes={notes}
                editable={viewMode === 'edit'}
                className="flex-[3_1_560px]"
              />
            )}
            {courseId && lessonId && (
              <LessonCardsList
                courseId={courseId}
                lessonId={lessonId}
                cards={lessonCards}
                editable={viewMode === 'edit'}
                onNavigate={navigate}
                className="flex-[2_1_340px]"
                footer={
                  !archived && !isInline ? (
                    <SimpleLearnOptions
                      key={lesson.id}
                      courseId={course.id}
                      initialLessonId={lesson.id}
                    />
                  ) : undefined
                }
              />
            )}
          </motion.div>

          <AnimatedDisclosure open={viewMode === 'edit' && Boolean(courseId && lessonId)}>
            {courseId && lessonId && (
              <div className="rounded-3xl bg-surface p-6 shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)] md:p-8">
                <LessonCardsSection
                  courseId={courseId}
                  lessonId={lessonId}
                  lessonName={lesson.name}
                  lessonCards={lessonCards}
                  lessonSchedulingConfig={lessonDeck}
                  onNavigate={navigate}
                />
              </div>
            )}
          </AnimatedDisclosure>
          {courseId && lessonId && <RelatedQuestionSets courseId={courseId} lessonId={lessonId} />}
        </div>
      </div>
    </div>
  );
}

function LessonViewSkeleton() {
  return (
    <div className={`${COURSE_PAGE_FRAME} py-8`}>
      <Skeleton className="mb-6 h-11 w-24 rounded-full bg-ink/10" />
      <div className="mb-6 flex flex-col gap-3">
        <Skeleton className="h-11 w-72 max-w-full rounded-xl bg-ink/10" />
        <Skeleton className="h-4 w-52 rounded bg-ink/10" />
      </div>
      <div className="flex flex-wrap gap-6">
        <Skeleton className="h-80 flex-[3_1_560px] rounded-3xl bg-ink/[0.06]" />
        <Skeleton className="h-80 flex-[2_1_340px] rounded-3xl bg-ink/[0.06]" />
      </div>
    </div>
  );
}
