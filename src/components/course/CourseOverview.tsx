import { useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import type { PathNode, PracticePathNode } from '../../course/path';
import type { CourseAssessment, Lesson } from '../../db/types';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { LessonNodeDetail } from './LessonNode';
import type { LessonReorderInteraction } from './useLessonPathReorder';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { formatDate } from '../../utils/datetime';
import { AddCourseControl, type CourseAddKind } from './AddCourseControl';
import { AddLessonControl } from './AddLessonControl';
import { Button } from '../ui/Button';
import { CardsIcon, CheckIcon, ChevronRightIcon, EditIcon, FlagIcon } from '../ui/icons';
import './course-overview.css';

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

export function CourseOverview(props: CourseOverviewProps) {
  const { nodes, authoring, archived, practiceProgress } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingLesson, setAddingLesson] = useState(false);
  const selected =
    nodes.find((node) => node.id === selectedId) ??
    nodes.find((node) => node.nodeType === 'lesson' && node.status === 'available') ??
    nodes[0];
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const detailRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const restoreAdd = () => {
    setAddingLesson(false);
    addRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  function select(node: PathNode) {
    setSelectedId(node.id);
    // On a narrow screen the companion follows the path; bring the selected
    // content into view rather than leaving the tap's result below the fold.
    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true });
        detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    }
  }

  return (
    <div className="course-overview-grid">
      <section className="course-paper" aria-labelledby="course-path-heading">
        <div className="course-section-heading">
          <div>
            <h2 id="course-path-heading">Course</h2>
            <span>{props.lessonCount} lessons</span>
          </div>
          {authoring && (
            <div ref={addRef}>
              <AddCourseControl
                onAdd={(kind) => {
                  if (kind === 'lesson') setAddingLesson(true);
                  else props.onAdd(kind);
                }}
              />
            </div>
          )}
        </div>
        {authoring && addingLesson && (
          <div className="mt-4">
            <AddLessonControl
              initiallyOpen
              courseId={props.courseId}
              lessonCount={props.lessonCount}
              onCancel={restoreAdd}
              onCreated={props.onLessonCreated}
            />
          </div>
        )}
        <p id="lesson-path-reorder-instructions" className="sr-only">
          In Author mode, drag this lesson to reorder; with touch, hold first. Alternatively, press
          Alt and the up or down arrow key.
        </p>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {props.announcement}
        </div>
        {nodes.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-soft">This course has no lessons yet.</p>
        ) : (
          <div className="course-path" aria-label="Course path">
            {nodes.map((node, index) => {
              const lesson = node.nodeType === 'lesson' ? node : undefined;
              const checkpoint = node.nodeType === 'checkpoint' ? node : undefined;
              const practice =
                node.nodeType === 'practice-manual' || node.nodeType === 'practice-auto'
                  ? node
                  : undefined;
              const progress = practice ? practiceProgress.get(practice.nodeKey) : undefined;
              const name = nodeName(node);
              const status = lesson?.status ?? (progress?.completed ? 'completed' : 'available');
              const reorder = lesson && authoring ? props.reorderFor(lesson.lesson.id) : undefined;
              const label = checkpoint
                ? `${archived ? 'Archived' : authoring ? 'Edit' : 'Open'} checkpoint: ${name}`
                : practice
                  ? `Manual practice: ${name}, ${Math.round((progress?.fraction ?? 0) * 100)}% secured`
                  : lesson?.status === 'locked' && authoring
                    ? `${name}, locked for study`
                    : name;
              return (
                <div
                  className={`course-stop ${status} ${checkpoint ? 'course-checkpoint' : practice ? 'course-practice' : ''}`}
                  key={node.id}
                >
                  {index < nodes.length - 1 && (
                    <svg
                      className="course-connector"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        vectorEffect="non-scaling-stroke"
                        d={
                          index % 2
                            ? 'M 100 0 C 180 40, -80 60, 0 100'
                            : 'M 0 0 C -80 40, 180 60, 100 100'
                        }
                      />
                    </svg>
                  )}
                  <motion.button
                    ref={reorder?.registerElement}
                    type="button"
                    className={`course-node ${selected?.id === node.id ? 'selected' : ''}`}
                    aria-label={label}
                    aria-pressed={selected?.id === node.id}
                    aria-describedby={
                      reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined
                    }
                    aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
                    aria-roledescription={reorder?.enabled ? 'sortable lesson' : undefined}
                    title={
                      lesson?.status === 'locked' ? props.lockHint(lesson.lesson.id) : undefined
                    }
                    onPointerDown={reorder?.onPointerDown}
                    onPointerMove={reorder?.onPointerMove}
                    onPointerUp={reorder?.onPointerUp}
                    onPointerCancel={reorder?.onPointerCancel}
                    onClickCapture={reorder?.onClickCapture}
                    onKeyDown={reorder?.onKeyDown}
                    onClick={() =>
                      checkpoint && !archived
                        ? props.onAssessmentOpen(checkpoint.assessment.id)
                        : select(node)
                    }
                    style={{
                      x: reorder?.offset?.x ?? 0,
                      y: reorder?.offset?.y ?? 0,
                      zIndex: reorder?.lifted ? 30 : undefined,
                    }}
                    whileTap={multiplier ? { scale: 0.97 } : undefined}
                    transition={{ type: 'spring', visualDuration: 0.25 * multiplier, bounce: 0 }}
                  >
                    <span className="course-node-face">
                      {checkpoint ? (
                        <FlagIcon />
                      ) : practice ? (
                        <CardsIcon />
                      ) : status === 'completed' ? (
                        <CheckIcon />
                      ) : status === 'locked' ? (
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <rect x="5" y="10" width="14" height="11" rx="3" />
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                        </svg>
                      ) : (
                        String(
                          nodes.slice(0, index + 1).filter((item) => item.nodeType === 'lesson')
                            .length,
                        ).padStart(2, '0')
                      )}
                    </span>
                  </motion.button>
                  <motion.div
                    className="course-node-label"
                    style={{
                      x: reorder?.offset?.x ?? 0,
                      y: reorder?.offset?.y ?? 0,
                      zIndex: reorder?.lifted ? 30 : undefined,
                    }}
                  >
                    <strong>{name}</strong>
                    <span>
                      {lesson
                        ? `${props.detailForLesson(lesson.lesson.id).cardCount} cards${lesson.lesson.isExtension ? ' · Extension' : ''}`
                        : checkpoint
                          ? 'Checkpoint'
                          : 'Practice'}
                    </span>
                    {authoring && practice && (
                      <button
                        type="button"
                        className="course-edit-practice"
                        aria-label={`Edit ${name}`}
                        onClick={() => props.onPracticeEdit(practice)}
                      >
                        <EditIcon width={14} height={14} />
                      </button>
                    )}
                  </motion.div>
                  {reorder?.dropMarker && (
                    <div
                      aria-hidden="true"
                      className={`course-drop-marker ${reorder.dropMarker}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <aside>
        {selected && (
          <div className="course-companion" ref={detailRef} tabIndex={-1}>
            <CourseNodeDetail key={selected.id} node={selected} {...props} />
          </div>
        )}
        {props.assessments.length > 0 && (
          <section className="course-deadlines" aria-label="Assessments">
            <h2 className="course-eyebrow">On the horizon</h2>
            {props.assessments.map((assessment) => (
              <button
                key={assessment.id}
                type="button"
                disabled={archived}
                onClick={() => props.onAssessmentOpen(assessment.id)}
              >
                <FlagIcon width={17} height={17} />
                <span>
                  <strong>{assessment.name}</strong>
                  <small>
                    {assessment.examDate === undefined
                      ? 'Steady retention'
                      : formatDate(assessment.examDate, assessment.timeZone ?? props.timeZone)}
                  </small>
                </span>
              </button>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}

function nodeName(node: PathNode): string {
  if (node.nodeType === 'lesson') return node.lesson.name;
  if (node.nodeType === 'checkpoint') return node.assessment.name;
  return node.practiceNode?.name ?? 'Practice';
}

function CourseNodeDetail({ node, ...props }: CourseOverviewProps & { node: PathNode }) {
  const lesson = node.nodeType === 'lesson' ? node : undefined;
  const practice =
    node.nodeType === 'practice-manual' || node.nodeType === 'practice-auto' ? node : undefined;
  const detail = lesson ? props.detailForLesson(lesson.lesson.id) : undefined;
  const progress = practice ? props.practiceProgress.get(practice.nodeKey) : undefined;
  const locked = lesson?.status === 'locked' && !props.authoring && !props.archived;
  return (
    <div className="course-detail">
      <h2>{nodeName(node)}</h2>
      {lesson?.lesson.description && <p>{lesson.lesson.description}</p>}
      {detail && (
        <div className="course-detail-meta">
          <CardsIcon width={16} height={16} />
          {detail.cardCount} cards<span>·</span>
          {lesson?.status === 'completed'
            ? 'Completed'
            : lesson?.status === 'locked' && !props.archived
              ? (props.lockHint(lesson.lesson.id) ?? 'Not yet unlocked')
              : `${detail.masteryPct}% mastery`}
        </div>
      )}
      {progress && <p className="mb-5">{Math.round(progress.fraction * 100)}% secured</p>}
      <Button
        variant="primary"
        disabled={locked || (props.archived && !lesson)}
        onClick={() => {
          if (lesson) props.onLessonOpen(lesson.lesson.id);
          else if (practice) props.onPracticeOpen(practice);
          else if (node.nodeType === 'checkpoint') props.onAssessmentOpen(node.assessment.id);
        }}
      >
        {lesson
          ? locked
            ? 'Lesson locked'
            : 'Open lesson'
          : practice
            ? 'Practise'
            : 'View checkpoint'}
        <ChevronRightIcon width={17} height={17} />
      </Button>
      {progress?.assessment && !props.archived && (
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() => props.onAssessmentPractise(progress.assessment!.assessmentId)}
        >
          Practise for {progress.assessment.name}
        </Button>
      )}
    </div>
  );
}
