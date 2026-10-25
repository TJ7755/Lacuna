import { DeckFind } from '../components/search/DeckFind';
import { COURSE_PAGE_FRAME } from '../components/course/coursePageLayout';
import { LessonViewSkeleton } from '../components/course/LessonViewSkeleton';
import { RelatedQuestionSets } from '../components/question-sets/RelatedQuestionSets';
// Lesson view page — a study destination first, notes/cards second. A header
// (title, one meta line, a Study/Edit pill and the study action) sits above a large
// reading card for the notes beside a compact "Cards in this lesson" list. The
// workspace renders in one of two modes, resolved by src/course/lessonViewMode.ts:
// View (read-only) or Edit (the same layout with edit controls faded in, and
// the full card management section revealed beneath), driven by the course's own
// Course.lessonViewMode.
// Route: /course/:courseId/lesson/:lessonId
// British English throughout.

import { useRef } from 'react';
import { PageLoading } from '../components/ui/PageLoadingBoundary';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLink as Link } from '../components/ui/AppLink';
import { useLessonViewData } from '../state/useLessonViewData';
import { PageArrival } from '../components/ui/PageArrival';
import { LessonNotesCard } from '../components/notes/LessonNotesCard';
import { LessonCardsSection } from '../components/cards/LessonCardsSection';
import { LessonCardsList } from '../components/cards/LessonCardsList';
import { learntCardCount } from '../components/cards/lessonCardRow';
import { ArrowRightIcon } from '../components/ui/icons';
import { Button } from '../components/ui/Button';
import { updateCourse } from '../db/courseRepository';
import { AnimatedDisclosure } from '../components/ui/AnimatedDisclosure';
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
import { calendarDaysUntil } from '../utils/datetime';
import { reorderLessons, updateLesson } from '../db/lessonRepository';
import { moveLessonIds } from '../components/course/useLessonPathReorder';
import {
  focusAfterLessonDeletion,
  LessonActionsMenu,
  lessonContextMenu,
} from '../components/course/LessonActionsMenu';
import type { MenuHandle } from '../components/ui/Menu';
import { useToast } from '../components/ui/Toast';
import { SimpleLearnOptions } from '../components/learn/SimpleLearnOptions';
import { usePageShortcuts } from '../hooks/usePageShortcuts';

export function LessonView() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();

  const navigate = useNavigate();
  // A caller can request focus on the first card action.
  const focusNewCard =
    (useLocation().state as { focusNewCard?: boolean } | null)?.focusNewCard === true;
  const { notify } = useToast();
  const lessonMenu = useRef<MenuHandle>(null);
  const {
    lesson,
    course,
    lessons,
    examDates,
    notes,
    lessonCards,
    dueReviewCardIds,
    studyReady,
    lessonDeck,
  } = useLessonViewData(courseId, lessonId);

  const shortcutArchived = course?.archived === true;
  usePageShortcuts({
    s:
      !shortcutArchived && lessonCards && lessonCards.length > 0
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
    lessonCards === undefined ||
    !studyReady
  ) {
    return <PageLoading fallback={<LessonViewSkeleton />} />;
  }

  // Not found.
  if (lesson === null || course === null) {
    return (
      <div className={`${COURSE_PAGE_FRAME} py-8`}>
        <div className="rounded-3xl bg-surface p-10 card-surface">
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

  const archived = course.archived === true;

  // Header figures, scoped to this lesson's own cards (reusing the same FSRS
  // helpers CoursePath uses at course scope — see CoursePath.tsx and
  // fsrs/eligibility.ts, fsrs/objective.ts).
  const now = Date.now();
  const lessonMastery = progressValue(lessonCards, course, now);
  const { nearestExam, examUrgent } = courseHeaderStats(course, examDates, lessonMastery, now);
  // Due means what Review due cards serves, counted within this lesson.
  const lessonDueCount = lessonCards.filter((card) => dueReviewCardIds?.has(card.id)).length;
  const viewMode = archived ? 'study' : resolveLessonViewMode(course);
  const switchToEdit =
    !archived && canEditLessons(course)
      ? () =>
          void updateCourse(course.id, { lessonViewMode: 'edit' }).catch(() => {
            notify('Could not switch to Edit. Try again.', 'negative');
          })
      : undefined;
  const authoring = !archived && isLessonAuthoringMode(course);
  const emptyAuthoring =
    authoring && viewMode === 'edit' && lessonCards.length === 0 && notes.length === 0;
  const metaParts = lessonMetaParts({
    learnt: learntCardCount(lessonCards),
    total: lessonCards.length,
    noteCount: notes.length,
    dueCount: lessonDueCount,
    daysToExam:
      nearestExam === undefined ? undefined : Math.max(calendarDaysUntil(nearestExam, now), 0),
  });
  // The first two parts are the empty card/note counters; keep any exam countdown.
  const visibleMetaParts = emptyAuthoring ? metaParts.slice(2) : metaParts;
  const lessonPosition = lessons.findIndex((candidate) => candidate.id === lesson.id);
  const lessonStudyPath = `/lesson/${encodeURIComponent(lesson.id)}/learn`;

  return (
    <PageArrival key={lesson.id} className={`${COURSE_PAGE_FRAME} py-8`}>
      <div className="flex flex-col gap-6">
        <div data-page-part="">
          <LessonHeader
            title={lesson.name}
            description={lesson.description || undefined}
            meta={
              visibleMetaParts.length > 0 && (
                <span className={examUrgent ? 'text-warning-fg' : undefined}>
                  {visibleMetaParts.join(' · ')}
                </span>
              )
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
            actions={
              authoring && courseId
                ? (startRename) => (
                    <LessonActionsMenu
                      lesson={lesson}
                      position={lessonPosition}
                      count={lessons.length}
                      handle={lessonMenu}
                      onRename={startRename}
                      onMove={(delta) => {
                        const ids = lessons.map((candidate) => candidate.id);
                        reorderLessons(
                          courseId,
                          moveLessonIds(ids, lesson.id, lessonPosition + delta),
                        ).catch(() => notify('Lesson order could not be saved.', 'negative'));
                      }}
                      onDeleted={() => {
                        void navigate(`/course/${courseId}`);
                        focusAfterLessonDeletion(['#course-path-heading', 'main h1']);
                      }}
                    />
                  )
                : undefined
            }
            contextMenu={authoring ? lessonContextMenu(() => lessonMenu.current) : undefined}
          >
            {archived ? (
              <ArchivedCourseRestoreNotice />
            ) : emptyAuthoring ? null : (
              <Button
                variant="primary"
                size="lg"
                disabled={lessonCards.length === 0}
                onClick={() => navigate(lessonStudyPath)}
              >
                {/* Named for its scope: course-level Study opens the session plan instead. */}
                Study lesson
                <ArrowRightIcon />
              </Button>
            )}
          </LessonHeader>
        </div>

        {/* Empty notes stay below the cards; existing notes retain the reading layout. */}
        <div
          data-page-part=""
          data-lesson-workspace-mode={viewMode}
          className="flex flex-col gap-6"
        >
          <div
            className={`flex items-start gap-6 ${notes.length === 0 ? 'flex-col' : 'flex-wrap'}`}
          >
            {lessonId && (viewMode === 'edit' || notes.length > 0) && (
              <LessonNotesCard
                lessonId={lessonId}
                notes={notes}
                editable={viewMode === 'edit'}
                className={notes.length === 0 ? 'order-2 w-full' : 'flex-[3_1_560px]'}
              />
            )}
            {courseId && lessonId && (
              <LessonCardsList
                courseId={courseId}
                lessonId={lessonId}
                cards={lessonCards}
                editable={viewMode === 'edit'}
                onNavigate={navigate}
                onSwitchToEdit={switchToEdit}
                focusNewCard={focusNewCard && lessonCards.length === 0}
                prominentNewCard={emptyAuthoring}
                className={notes.length === 0 ? 'w-full' : 'flex-[2_1_340px]'}
                find={
                  <DeckFind key={lesson.id} cards={lessonCards} course={course} lesson={lesson} />
                }
                footer={
                  !archived && lessonCards.length > 0 ? (
                    <SimpleLearnOptions
                      key={lesson.id}
                      courseId={course.id}
                      initialLessonId={lesson.id}
                    />
                  ) : undefined
                }
              />
            )}
          </div>

          <AnimatedDisclosure
            open={viewMode === 'edit' && Boolean(courseId && lessonId) && lessonCards.length > 0}
          >
            {courseId && lessonId && (
              <div className="rounded-3xl bg-surface p-6 card-surface md:p-8">
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
    </PageArrival>
  );
}
