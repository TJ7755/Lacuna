import { useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { PathNode, PracticePathNode } from '../../course/path';
import type { CourseAssessment, Lesson } from '../../db/types';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { LessonReorderInteraction } from './useLessonPathReorder';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatShortDate } from '../../utils/datetime';
import { MOTION_EASING } from '../ui/motion';
import { cn } from '../ui/cn';
import { AddCourseControl, type CourseAddKind } from './AddCourseControl';
import { AddLessonControl } from './AddLessonControl';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { CardsIcon, CheckIcon, ChevronRightIcon, EditIcon, FlagIcon } from '../ui/icons';
import { QuestionSetCourseRow } from './QuestionSetCourseRow';

export interface LessonNodeDetail {
  cardCount: number;
  dueCount: number;
  masteryPct: number;
}

interface CourseOverviewProps {
  courseId: string;
  nodes: PathNode[];
  lessonCount: number;
  assessments: CourseAssessment[];
  timeZone?: string;
  authoring: boolean;
  archived: boolean;
  announcement: string;
  detailForLesson: (id: string) => LessonNodeDetail;
  lockHint: (id: string) => string | undefined;
  reorderFor: (id: string) => LessonReorderInteraction;
  practiceProgress: Map<
    string,
    { fraction: number; completed: boolean; assessment?: AssessmentPracticeOption }
  >;
  onLessonOpen: (id: string) => void;
  onLessonCreated: (lesson: Lesson) => void;
  onPracticeOpen: (node: PracticePathNode) => void;
  onPracticeEdit: (node: PracticePathNode) => void;
  onAssessmentOpen: (id: string) => void;
  onAssessmentPractise: (id: string) => void;
  onAdd: (kind: Exclude<CourseAddKind, 'lesson'>) => void;
}

const CARD =
  'rounded-3xl bg-surface shadow-[0_1px_2px_hsl(var(--ink)/0.05),0_16px_40px_-28px_hsl(var(--ink)/0.22)]';
const SECURE = 90;

/**
 * The course as a list of lessons in order, with checkpoints and practice stops where
 * they fall, beside the course's assessments. Each lesson shows its number, state and a
 * progress bar; in Edit mode lessons can be dragged or moved with Alt and the arrows.
 */
export function CourseOverview(props: CourseOverviewProps) {
  const { nodes, authoring, archived, practiceProgress } = props;
  const [addingLesson, setAddingLesson] = useState(false);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const addRef = useRef<HTMLDivElement>(null);
  const restoreAdd = () => {
    setAddingLesson(false);
    addRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };
  let lessonNumber = 0;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        className={cn(CARD, 'min-w-0 flex-[2_1_520px] px-5 pb-3 pt-6 md:px-7 md:pt-7')}
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
                  if (kind === 'lesson') setAddingLesson(true);
                  else props.onAdd(kind);
                }}
              />
            </div>
          )}
        </div>
        {authoring && (
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
          In Edit mode, drag this lesson to reorder; with touch, hold first. Alternatively, press
          Alt and the up or down arrow key.
        </p>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {props.announcement}
        </div>
        {nodes.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-soft">This course has no lessons yet.</p>
        ) : (
          <ol className="m-0 list-none p-0" aria-label="Course path">
            {nodes.map((node, index) => {
              const arrive = {
                initial: m > 0 ? { opacity: 0, y: 10 } : false,
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: 0.42 * m,
                  delay: Math.min(index, 8) * 0.04 * m,
                  ease: MOTION_EASING.emphasised,
                },
              } as const;

              if (node.nodeType === 'checkpoint') {
                const date = node.assessment.examDate;
                return (
                  <motion.li key={node.id} {...arrive} className="my-1.5 ml-[18px]">
                    <div className="flex items-center gap-3 rounded-2xl bg-ink/[0.05] px-3.5 py-2.5 text-sm">
                      <FlagIcon width={16} height={16} className="shrink-0 text-ink-soft" />
                      <button
                        type="button"
                        disabled={archived}
                        onClick={() => props.onAssessmentOpen(node.assessment.id)}
                        aria-label={`${archived ? 'Archived' : authoring ? 'Edit' : 'Open'} checkpoint: ${node.assessment.name}`}
                        className="min-h-11 flex-1 text-left"
                      >
                        <strong className="font-bold">{node.assessment.name}</strong>
                        {date !== undefined && (
                          <span className="text-ink-faint">
                            {' · '}
                            {formatShortDate(date, node.assessment.timeZone ?? props.timeZone)}
                          </span>
                        )}
                      </button>
                      {!archived && (
                        <button
                          type="button"
                          onClick={() => props.onAssessmentPractise(node.assessment.id)}
                          className="min-h-11 px-1 font-bold text-accent-ink hover:underline"
                        >
                          Revise
                        </button>
                      )}
                    </div>
                  </motion.li>
                );
              }

              if (node.nodeType === 'practice-question-set') {
                return (
                  <motion.li key={node.id} {...arrive} className="relative flex flex-col">
                    <QuestionSetCourseRow
                      node={node}
                      index={index}
                      authoring={authoring && !archived}
                    />
                  </motion.li>
                );
              }

              const lesson = node.nodeType === 'lesson' ? node : undefined;
              const practice =
                node.nodeType === 'practice-manual' || node.nodeType === 'practice-auto'
                  ? node
                  : undefined;
              const progress = practice ? practiceProgress.get(practice.nodeKey) : undefined;
              const detail = lesson ? props.detailForLesson(lesson.lesson.id) : undefined;
              const status = lesson?.status ?? (progress?.completed ? 'completed' : 'available');
              const reorder = lesson && authoring ? props.reorderFor(lesson.lesson.id) : undefined;
              if (lesson) lessonNumber += 1;
              const name = lesson
                ? lesson.lesson.name
                : (practice?.practiceNode?.name ?? 'Card practice');
              const pct = lesson
                ? (detail?.masteryPct ?? 0)
                : Math.round((progress?.fraction ?? 0) * 100);
              const done = status === 'completed';
              const locked = status === 'locked';
              const state = lesson
                ? locked
                  ? (props.lockHint(lesson.lesson.id) ?? 'Locked')
                  : done && pct >= SECURE
                    ? 'Secure'
                    : `${detail?.cardCount ?? 0} cards${detail?.dueCount ? ` · ${detail.dueCount} due` : ''}${lesson.lesson.isExtension ? ' · Extension' : ''}`
                : `${pct}% secured`;
              const label = practice
                ? `Manual practice: ${name}, ${pct}% secured`
                : locked && authoring
                  ? `${name}, locked for study`
                  : name;
              const open = () => {
                if (lesson) props.onLessonOpen(lesson.lesson.id);
                else if (practice) props.onPracticeOpen(practice);
              };

              return (
                <motion.li key={node.id} {...arrive} className="relative flex flex-col">
                  <motion.button
                    // Motion keeps the first ref it is given, so remount when authoring
                    // starts or the reorder hook never sees this row.
                    key={authoring ? 'author' : 'study'}
                    ref={reorder?.registerElement}
                    type="button"
                    aria-label={label}
                    aria-describedby={
                      reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined
                    }
                    aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
                    aria-roledescription={reorder?.enabled ? 'sortable lesson' : undefined}
                    title={locked && lesson ? props.lockHint(lesson.lesson.id) : undefined}
                    disabled={locked && !authoring && !archived}
                    onPointerDown={reorder?.onPointerDown}
                    onPointerMove={reorder?.onPointerMove}
                    onPointerUp={reorder?.onPointerUp}
                    onPointerCancel={reorder?.onPointerCancel}
                    onClickCapture={reorder?.onClickCapture}
                    onKeyDown={reorder?.onKeyDown}
                    onClick={open}
                    style={{
                      x: reorder?.offset?.x ?? 0,
                      y: reorder?.offset?.y ?? 0,
                      zIndex: reorder?.lifted ? 30 : undefined,
                    }}
                    data-press=""
                    whileTap={m ? { scale: 0.99 } : undefined}
                    className={cn(
                      'group flex w-full items-center gap-[18px] rounded-2xl px-3 py-3.5 text-left text-ink transition-colors',
                      'hover:bg-ink/[0.03] disabled:cursor-default',
                      reorder?.lifted &&
                        'bg-surface shadow-[0_18px_40px_-20px_hsl(var(--ink)/0.45)]',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums',
                        done
                          ? 'border-positive bg-positive text-surface'
                          : locked
                            ? 'border-line-strong bg-surface text-ink-faint'
                            : 'border-ink bg-surface text-ink',
                      )}
                    >
                      {practice ? (
                        <CardsIcon width={16} height={16} />
                      ) : done && pct >= SECURE ? (
                        <CheckIcon width={16} height={16} />
                      ) : (
                        lessonNumber
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex justify-between gap-3">
                        <span className={cn('truncate font-bold', locked && 'text-ink-soft')}>
                          {name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm text-ink-faint">
                          {state}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-1 overflow-hidden rounded-full bg-line"
                      >
                        <motion.span
                          className={cn(
                            'block h-1 origin-left rounded-full',
                            done ? 'bg-positive' : 'bg-ink',
                          )}
                          style={{ width: `${locked ? 0 : pct}%` }}
                          initial={m > 0 ? { scaleX: 0 } : false}
                          animate={{ scaleX: 1 }}
                          transition={{
                            duration: 0.7 * m,
                            delay: (0.15 + Math.min(index, 8) * 0.04) * m,
                            ease: MOTION_EASING.emphasised,
                          }}
                        />
                      </span>
                    </span>
                    <ChevronRightIcon
                      width={16}
                      height={16}
                      className="shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </motion.button>
                  {authoring && practice && (
                    <button
                      type="button"
                      aria-label={`Edit ${name}`}
                      onClick={() => props.onPracticeEdit(practice)}
                      className="absolute right-10 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink-faint hover:bg-ink/5 hover:text-ink"
                    >
                      <EditIcon width={14} height={14} />
                    </button>
                  )}
                  {reorder?.dropMarker && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-x-3 h-0.5 rounded-full bg-accent',
                        reorder.dropMarker === 'before' ? '-top-px' : '-bottom-px',
                      )}
                    />
                  )}
                </motion.li>
              );
            })}
          </ol>
        )}
      </section>
      {props.assessments.length > 0 && (
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section
            className={cn(CARD, 'flex flex-col gap-3.5 p-6')}
            aria-labelledby="course-assessments-heading"
          >
            <h2 id="course-assessments-heading" className="font-display text-lg">
              Assessments
            </h2>
            {props.assessments.map((assessment) => {
              const date = assessment.examDate;
              const zone = assessment.timeZone ?? props.timeZone;
              return (
                <button
                  key={assessment.id}
                  type="button"
                  disabled={archived}
                  onClick={() => props.onAssessmentOpen(assessment.id)}
                  className="-mx-2 flex min-h-11 items-center gap-3.5 rounded-xl px-2 py-1 text-left transition-colors hover:bg-ink/[0.03]"
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
                    <strong className="block truncate font-bold">{assessment.name}</strong>
                    <span className="text-sm text-ink-faint">
                      {assessment.kind === 'final' ? 'All lessons' : 'Checkpoint'}
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        </aside>
      )}
    </div>
  );
}
