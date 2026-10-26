import { useLayoutEffect, useRef, useState } from 'react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { cn } from '../ui/cn';
import { AddCourseControl } from './AddCourseControl';
import { AddLessonControl } from './AddLessonControl';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { FlagIcon } from '../ui/icons';
import { PathNodeActionsMenu } from './PathNodeActionsMenu';
import type { MenuHandle } from '../ui/Menu';
import type { CourseOverviewProps } from './courseOverviewTypes';
import { renderCoursePathRows } from './CoursePathRows';

export type { LessonNodeDetail } from './courseOverviewTypes';

const CARD = 'rounded-3xl bg-surface card-surface';

/**
 * The course as a list of lessons in order, with checkpoints and practice stops where
 * they fall, beside the course's assessments. Each lesson shows its number, state and a
 * progress bar. Authors and learners with locked imports can reorder lessons.
 */
export function CourseOverview(props: CourseOverviewProps) {
  const { nodes, authoring, archived } = props;
  const [addingLesson, setAddingLesson] = useState(false);
  const [creationAtEmpty, setCreationAtEmpty] = useState(nodes.length === 0);
  useLayoutEffect(() => {
    if (authoring || !addingLesson) return;
    setAddingLesson(false);
  }, [authoring, addingLesson]);
  const startAddingLesson = () => {
    setCreationAtEmpty(nodes.length === 0);
    setAddingLesson(true);
  };
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const addRef = useRef<HTMLDivElement>(null);
  const restoreAdd = () => {
    setAddingLesson(false);
    addRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };
  const lessonMenus = useRef(new Map<string, MenuHandle>());
  const lessons = nodes.flatMap((node) => (node.nodeType === 'lesson' ? [node.lesson] : []));

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-6">
        <section
          className={cn(CARD, 'min-w-0 px-5 pb-3 pt-6 md:px-7 md:pt-7')}
          data-path-card=""
          data-page-part=""
          aria-labelledby="course-path-heading"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="course-path-heading" className="font-display text-[22px]">
              Lessons
            </h2>
            {authoring && (
              <div ref={addRef}>
                <AddCourseControl
                  kinds={props.lessonCount > 0 ? undefined : ['lesson', 'practice', 'checkpoint']}
                  onAdd={(kind) => {
                    if (kind === 'lesson') startAddingLesson();
                    else props.onAdd(kind);
                  }}
                />
              </div>
            )}
          </div>
          {authoring && !creationAtEmpty && (
            <AnimatedDisclosure open={addingLesson} innerClassName="pb-3">
              <AddLessonControl
                initiallyOpen
                courseId={props.courseId}
                lessonCount={props.lessonCount}
                onCancel={restoreAdd}
                onCreated={props.onLessonCreated}
              />
            </AnimatedDisclosure>
          )}
          <p id="lesson-path-reorder-instructions" className="sr-only">
            {props.localOrder ? 'Hold a lesson' : 'In Edit mode, hold a row'} to lift it, then drag
            to reorder. Alternatively, press Alt and the up or down arrow key.
          </p>
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {props.announcement}
          </div>
          {/* Keep the creation origin and form mounted when live nodes arrive. */}
          <AnimatedDisclosure open={nodes.length === 0 || (creationAtEmpty && addingLesson)}>
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p
                className={cn('text-sm text-ink-soft', nodes.length > 0 && 'invisible')}
                aria-hidden={nodes.length > 0 || undefined}
              >
                This course has no lessons yet.
              </p>
              {authoring && (creationAtEmpty || !addingLesson) && (
                <ExpandingCreateControl
                  label="Add first lesson"
                  prominent
                  align="centre"
                  closedWidth={176}
                  open={addingLesson}
                  onOpenChange={(open) => {
                    if (open) setCreationAtEmpty(true);
                    setAddingLesson(open);
                  }}
                >
                  <AddLessonControl
                    initiallyOpen
                    courseId={props.courseId}
                    lessonCount={props.lessonCount}
                    onCancel={() => setAddingLesson(false)}
                    onCreated={props.onLessonCreated}
                  />
                </ExpandingCreateControl>
              )}
            </div>
          </AnimatedDisclosure>
          {nodes.length > 0 && (
            <ol className="m-0 list-none p-0" aria-label="Course path">
              {renderCoursePathRows(props, m, lessonMenus, lessons)}
            </ol>
          )}
        </section>
        {props.summary?.(CARD)}
      </div>
      {props.assessments.length > 0 && (
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section
            className={cn(CARD, 'flex flex-col gap-3.5 px-5 pb-6 pt-6 md:px-7 md:pt-7')}
            data-path-card=""
            data-page-part=""
            aria-labelledby="course-assessments-heading"
          >
            {/* Matches the Lessons card beside it, so the two headings share a line. */}
            <h2 id="course-assessments-heading" className="font-display text-[22px]">
              Assessments
            </h2>
            {props.assessments.map((assessment) => {
              const date = assessment.examDate;
              const zone = assessment.timeZone ?? props.timeZone;
              return (
                <div
                  key={assessment.id}
                  data-path-source={assessment.id}
                  className="relative flex items-center has-[[aria-expanded=true]]:z-20"
                >
                  <button
                    data-path-row=""
                    data-press={authoring ? 'none' : undefined}
                    type="button"
                    disabled={archived}
                    onClick={() => props.onAssessmentOpen(assessment.id)}
                    className={cn(
                      '-mx-2 flex min-h-11 min-w-0 flex-1 items-center gap-3.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-ink/[0.03]',
                      authoring && 'pr-[60px]',
                    )}
                  >
                    <span className="w-11 shrink-0 text-center leading-tight">
                      {date === undefined ? (
                        <FlagIcon width={18} height={18} className="mx-auto text-ink-soft" />
                      ) : (
                        <>
                          <span className="block font-display text-[22px] font-semibold tracking-tight tabular-nums">
                            {new Date(date).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              timeZone: zone,
                            })}
                          </span>
                          <span className="text-xs text-ink-faint">
                            {new Date(date).toLocaleDateString('en-GB', {
                              month: 'short',
                              timeZone: zone,
                            })}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words font-bold">{assessment.name}</strong>
                      <span className="text-sm text-ink-faint">
                        {assessment.kind === 'final' ? 'All lessons' : 'Checkpoint'}
                      </span>
                    </span>
                  </button>
                  {authoring && !archived && (
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                      <PathNodeActionsMenu
                        node={{
                          id: assessment.id,
                          nodeType: 'checkpoint',
                          assessment,
                          afterLessonId: assessment.afterLessonId,
                        }}
                        lessons={lessons}
                        onEdit={() => props.onAssessmentOpen(assessment.id)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </aside>
      )}
    </div>
  );
}
