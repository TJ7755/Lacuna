import type { RefObject } from 'react';
import { m as motion } from 'motion/react';
import { formatShortDate } from '../../utils/datetime';
import { countOf } from '../../utils/plural';
import { MOTION_EASING, scaledSpring } from '../ui/motion';
import { cn } from '../ui/cn';
import { CardsIcon, CheckIcon, ChevronRightIcon, FlagIcon } from '../ui/icons';
import { PathNodeActionsMenu } from './PathNodeActionsMenu';
import { QuestionSetCourseRow } from './QuestionSetCourseRow';
import {
  focusAfterLessonDeletion,
  LessonActionsMenu,
  lessonContextMenu,
} from './LessonActionsMenu';
import type { MenuHandle } from '../ui/Menu';
import type { Lesson } from '../../db/types';
import type { CourseOverviewProps } from './courseOverviewTypes';

const SECURE = 90;

export function renderCoursePathRows(
  props: CourseOverviewProps,
  m: number,
  lessonMenus: RefObject<Map<string, MenuHandle>>,
  lessons: Lesson[],
) {
  const { nodes, authoring, archived, practiceProgress } = props;
  let lessonNumber = 0;
  return nodes.map((node, index) => {
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
      const reorder = authoring ? props.reorderFor(node.id) : undefined;
      const date = node.assessment.examDate;
      return (
        <motion.li
          key={node.id}
          data-path-source={node.id}
          {...arrive}
          animate={{
            opacity: 1,
            y: reorder?.offset?.y ?? 0,
            scale: reorder?.lifted ? 1.02 : 1,
          }}
          transition={{
            y: reorder?.direct
              ? { duration: 0 }
              : { ...scaledSpring(m, 420, 36), velocity: reorder?.settleVelocity ?? 0 },
            scale: scaledSpring(m, 420, 36),
            layout: scaledSpring(m, 420, 36),
          }}
          style={{ zIndex: reorder?.lifted ? 30 : undefined }}
          className="relative my-1.5 ml-[18px] has-[[aria-expanded=true]]:z-20"
        >
          <div
            className={cn(
              'flex items-center gap-3 rounded-2xl bg-ink/[0.05] px-3.5 py-2.5 text-sm',
              reorder?.lifted && 'bg-surface path-editor-shadow',
              reorder?.refused && 'ring-1 ring-negative/40',
              authoring && 'pr-[60px]',
            )}
          >
            <FlagIcon width={16} height={16} className="shrink-0 text-ink-soft" />
            <button
              ref={reorder?.registerElement}
              onPointerDown={reorder?.onPointerDown}
              onPointerMove={reorder?.onPointerMove}
              onPointerUp={reorder?.onPointerUp}
              onPointerCancel={reorder?.onPointerCancel}
              onClickCapture={reorder?.onClickCapture}
              onKeyDown={reorder?.onKeyDown}
              aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
              aria-describedby={reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined}
              aria-roledescription={reorder?.enabled ? 'sortable path row' : undefined}
              data-drag-lifted={reorder?.lifted || undefined}
              data-drag-refused={reorder?.refused || undefined}
              data-path-row=""
              data-press={authoring ? 'none' : undefined}
              type="button"
              disabled={archived}
              onClick={() => props.onAssessmentOpen(node.assessment.id)}
              aria-label={`${archived ? 'Archived' : authoring ? 'Edit' : 'Open'} checkpoint: ${node.assessment.name}`}
              className="min-h-11 min-w-0 flex-1 break-words text-left"
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
          {authoring && !archived && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <PathNodeActionsMenu
                node={node}
                lessons={lessons}
                onEdit={() => props.onAssessmentOpen(node.assessment.id)}
              />
            </div>
          )}
        </motion.li>
      );
    }

    if (node.nodeType === 'practice-question-set') {
      const reorder = authoring ? props.reorderFor(node.id) : undefined;
      return (
        <motion.li
          key={node.id}
          data-path-source={node.id}
          {...arrive}
          animate={{
            opacity: 1,
            y: reorder?.offset?.y ?? 0,
            scale: reorder?.lifted ? 1.02 : 1,
          }}
          transition={{
            y: reorder?.direct
              ? { duration: 0 }
              : { ...scaledSpring(m, 420, 36), velocity: reorder?.settleVelocity ?? 0 },
            scale: scaledSpring(m, 420, 36),
            layout: scaledSpring(m, 420, 36),
          }}
          style={{ zIndex: reorder?.lifted ? 30 : undefined }}
          className="relative flex flex-col has-[[aria-expanded=true]]:z-20"
        >
          <QuestionSetCourseRow
            node={node}
            index={index}
            lessons={lessons}
            authoring={authoring && !archived}
            reorder={authoring ? props.reorderFor(node.id) : undefined}
          />
        </motion.li>
      );
    }

    const lesson = node.nodeType === 'lesson' ? node : undefined;
    const practice =
      node.nodeType === 'practice-manual' || node.nodeType === 'practice-auto' ? node : undefined;
    const progress = practice ? practiceProgress.get(practice.nodeKey) : undefined;
    const detail = lesson ? props.detailForLesson(lesson.lesson.id) : undefined;
    const status = lesson?.status ?? (progress?.completed ? 'completed' : 'available');
    const reorder =
      authoring && node.nodeType !== 'practice-auto' ? props.reorderFor(node.id) : undefined;
    if (lesson) lessonNumber += 1;
    const name = lesson ? lesson.lesson.name : (practice?.practiceNode?.name ?? 'Card practice');
    const pct = lesson ? (detail?.masteryPct ?? 0) : Math.round((progress?.fraction ?? 0) * 100);
    const done = status === 'completed';
    const locked = status === 'locked';
    const state = lesson
      ? locked
        ? (props.lockHint(lesson.lesson.id) ?? 'Locked')
        : done && pct >= SECURE
          ? 'Secure'
          : `${countOf(detail?.cardCount ?? 0, 'card')}${detail?.dueCount ? ` · ${detail.dueCount} due` : ''}${lesson.lesson.isExtension ? ' · Extension' : ''}`
      : `${pct}% secured`;
    const label = practice
      ? `Card practice: ${name}, ${pct}% secured`
      : locked && authoring
        ? `${name}, locked for study`
        : name;
    const morphsToEditor = authoring && !!practice?.practiceNode;
    const open = () => {
      if (lesson) props.onLessonOpen(lesson.lesson.id);
      else if (practice) props.onPracticeOpen(practice);
    };

    const lessonId = lesson?.lesson.id;
    const position = lessonNumber - 1;
    return (
      <motion.li
        key={node.id}
        data-path-source={node.id}
        {...arrive}
        animate={{
          opacity: 1,
          y: reorder?.offset?.y ?? 0,
          scale: reorder?.lifted ? 1.02 : 1,
        }}
        transition={{
          y: reorder?.direct
            ? { duration: 0 }
            : { ...scaledSpring(m, 420, 36), velocity: reorder?.settleVelocity ?? 0 },
          scale: scaledSpring(m, 420, 36),
          layout: scaledSpring(m, 420, 36),
        }}
        style={{ zIndex: reorder?.lifted ? 30 : undefined }}
        // Each animated row is its own stacking context; lift the one whose
        // menu is open above the rows after it.
        className="relative flex flex-col has-[[aria-expanded=true]]:z-20"
        data-path-lesson={lessonId}
        {...(authoring && lessonId
          ? lessonContextMenu(() => lessonMenus.current.get(lessonId))
          : {})}
      >
        <motion.button
          // Motion keeps the first ref it is given, so remount when authoring
          // starts or the reorder hook never sees this row.
          key={authoring ? 'author' : 'study'}
          ref={reorder?.registerElement}
          data-path-row=""
          type="button"
          aria-label={label}
          aria-describedby={reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined}
          aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
          aria-roledescription={reorder?.enabled ? 'sortable path row' : undefined}
          title={locked && lesson ? props.lockHint(lesson.lesson.id) : undefined}
          disabled={locked && !authoring && !archived}
          onPointerDown={reorder?.onPointerDown}
          onPointerMove={reorder?.onPointerMove}
          onPointerUp={reorder?.onPointerUp}
          onPointerCancel={reorder?.onPointerCancel}
          onClickCapture={reorder?.onClickCapture}
          onKeyDown={reorder?.onKeyDown}
          onClick={open}
          data-drag-lifted={reorder?.lifted || undefined}
          data-drag-refused={reorder?.refused || undefined}
          data-press={morphsToEditor ? 'none' : ''}
          whileTap={m && !reorder?.lifted && !morphsToEditor ? { scale: 0.99 } : undefined}
          className={cn(
            'group flex w-full items-center gap-[18px] rounded-2xl px-3 py-3.5 text-left text-ink transition-colors',
            'hover:bg-ink/[0.03] disabled:cursor-default',
            authoring && (lesson || practice) && 'pr-[60px]',
            reorder?.refused && 'ring-1 ring-negative/40',
            // Reserve the lifted border so dragging cannot change the row's bounds.
            reorder?.lifted ? 'bg-surface path-editor-shadow' : 'border border-transparent',
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
            {/* The name wraps to a second line rather than losing itself on a phone,
                          and keeps 8rem so the counts drop beneath it before a word breaks. */}
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span
                className={cn(
                  'line-clamp-2 min-w-[8rem] flex-[1_1_8rem] break-words font-bold',
                  locked && 'text-ink-soft',
                )}
              >
                {name}
              </span>
              <span className="shrink-0 whitespace-nowrap text-sm text-ink-faint">{state}</span>
            </span>
            <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-line">
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
          {!(authoring && (lesson || practice)) && (
            <ChevronRightIcon
              width={16}
              height={16}
              className="shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
            />
          )}
        </motion.button>
        {authoring && lesson && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <LessonActionsMenu
              lesson={lesson.lesson}
              position={position}
              count={props.lessonCount}
              onMove={(delta) => props.onLessonMove(lesson.lesson.id, delta)}
              handle={(menu) => {
                if (menu) lessonMenus.current.set(lesson.lesson.id, menu);
                else lessonMenus.current.delete(lesson.lesson.id);
              }}
              onDeleted={() => {
                const following = nodes
                  .slice(index + 1)
                  .find((candidate) => candidate.nodeType === 'lesson');
                const preceding = nodes
                  .slice(0, index)
                  .reverse()
                  .find((candidate) => candidate.nodeType === 'lesson');
                focusAfterLessonDeletion(
                  [following, preceding]
                    .filter((candidate) => candidate !== undefined)
                    .map((candidate) => `[data-path-lesson="${candidate.id}"] > button`)
                    .concat('#course-path-heading', 'main h1'),
                );
              }}
            />
          </div>
        )}
        {authoring && !archived && practice?.practiceNode && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <PathNodeActionsMenu
              node={practice}
              lessons={lessons}
              onEdit={() => props.onPracticeEdit(practice)}
            />
          </div>
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
  });
}
