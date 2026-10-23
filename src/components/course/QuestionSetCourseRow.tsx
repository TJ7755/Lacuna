import type { LessonReorderInteraction } from './useLessonPathReorder';
import { useState } from 'react';
import { m as motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QuestionSetPathNode } from '../../course/path';
import type { Lesson } from '../../db/types';
import { cn } from '../ui/cn';
import { PathNodeActionsMenu } from './PathNodeActionsMenu';
import { questionSetPathProgress } from '../../questions/questionSetPathProgress';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { MOTION_EASING } from '../ui/motion';
import { ChevronRightIcon, HelpIcon } from '../ui/icons';
import { QuestionSetPathEditor } from './QuestionSetPathEditor';
import { useQuestionSetPathData } from './useQuestionSetPathData';

/** A Practice questions stop in the course's lesson list; it opens the set directly. */
export function QuestionSetCourseRow({
  node,
  index,
  authoring,
  lessons,
  reorder,
}: {
  node: QuestionSetPathNode;
  index: number;
  authoring: boolean;
  lessons: Lesson[];
  reorder?: LessonReorderInteraction;
}) {
  const data = useQuestionSetPathData(node);
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const courseId = node.practiceNode.courseId;
  const multiple = node.questionSetIds.length !== 1;
  const unavailable = multiple || (data !== undefined && !data.content);
  const name = data?.content?.title ?? node.practiceNode.name;
  const progress = data ? questionSetPathProgress(data.attempt) : null;
  const pct = progress?.totalParts
    ? Math.round((progress.answeredParts / progress.totalParts) * 100)
    : 0;
  const state = multiple
    ? 'Multiple-set practice is not yet supported'
    : unavailable
    ? 'Unavailable'
    : progress
      ? `${progress.answeredParts}/${progress.totalParts} answered`
      : 'Practice questions';

  return (
    <>
      <motion.button
        key={authoring ? 'author' : 'study'}
        data-path-row=""
        ref={reorder?.registerElement}
        onPointerDown={reorder?.onPointerDown}
        onPointerMove={reorder?.onPointerMove}
        onPointerUp={reorder?.onPointerUp}
        onPointerCancel={reorder?.onPointerCancel}
        onClickCapture={reorder?.onClickCapture}
        onKeyDown={reorder?.onKeyDown}
        aria-describedby={reorder?.enabled ? 'lesson-path-reorder-instructions' : undefined}
        aria-roledescription={reorder?.enabled ? 'sortable path row' : undefined}
        aria-keyshortcuts={reorder?.enabled ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
        type="button"
        aria-label={`Practice questions: ${name}`}
        disabled={unavailable && !authoring}
        onClick={() =>
          authoring
            ? setEditing(true)
            : !unavailable && navigate(`/course/${courseId}/question-sets/${node.questionSetIds[0]}`, {
                state: {
                  questionSetReturnTo: location.pathname + location.search,
                  questionSetReturnLabel: 'Back to path',
                },
              })
        }
        data-press={authoring ? 'none' : ''}
        whileTap={m && !reorder?.lifted && !authoring ? { scale: 0.99 } : undefined}
        className={cn(
          authoring && 'pr-[60px]',
          reorder?.lifted && 'bg-surface path-editor-shadow',
          reorder?.refused && 'ring-1 ring-negative/40',
          'group flex w-full items-center gap-[18px] rounded-2xl px-3 py-3.5 text-left text-ink transition-colors hover:bg-ink/[0.03] disabled:cursor-default',
        )}
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface text-ink"
        >
          <HelpIcon width={16} height={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="line-clamp-2 min-w-[8rem] flex-[1_1_8rem] break-words font-bold">
              {name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-sm text-ink-faint">{state}</span>
          </span>
          <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-line">
            <motion.span
              className="block h-1 origin-left rounded-full bg-ink"
              style={{ width: `${pct}%` }}
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
        {!authoring && (
          <ChevronRightIcon
            width={16}
            height={16}
            className="shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
          />
        )}
      </motion.button>
      {authoring && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <PathNodeActionsMenu node={node} lessons={lessons} onEdit={() => setEditing(true)} />
        </div>
      )}
      {editing && (
        <QuestionSetPathEditor
          courseId={courseId}
          node={node.practiceNode}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
