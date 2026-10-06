import { useState } from 'react';
import { m as motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QuestionSetPathNode } from '../../course/path';
import { questionSetPathProgress } from '../../questions/questionSetPathProgress';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { MOTION_EASING } from '../ui/motion';
import { ChevronRightIcon, EditIcon, HelpIcon } from '../ui/icons';
import { QuestionSetPathEditor } from './QuestionSetPathEditor';
import { useQuestionSetPathData } from './useQuestionSetPathData';

/** A Practice questions stop in the course's lesson list; it opens the set directly. */
export function QuestionSetCourseRow({
  node,
  index,
  authoring,
}: {
  node: QuestionSetPathNode;
  index: number;
  authoring: boolean;
}) {
  const data = useQuestionSetPathData(node);
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [speed] = useMotionSpeed();
  const m = speedMultiplier(speed);
  const courseId = node.practiceNode.courseId;
  const unavailable = data !== undefined && !data.content;
  const name = data?.content?.title ?? node.practiceNode.name;
  const progress = data ? questionSetPathProgress(data.attempt) : null;
  const pct = progress?.totalParts
    ? Math.round((progress.answeredParts / progress.totalParts) * 100)
    : 0;
  const state = unavailable
    ? 'Unavailable'
    : progress
      ? `${progress.answeredParts}/${progress.totalParts} answered`
      : 'Practice questions';

  return (
    <>
      <motion.button
        type="button"
        aria-label={`Practice questions: ${name}`}
        disabled={unavailable}
        onClick={() =>
          navigate(`/course/${courseId}/question-sets/${node.questionSetId}`, {
            state: {
              questionSetReturnTo: location.pathname + location.search,
              questionSetReturnLabel: 'Back to path',
            },
          })
        }
        data-press=""
        whileTap={m ? { scale: 0.99 } : undefined}
        className="group flex w-full items-center gap-[18px] rounded-2xl px-3 py-3.5 text-left text-ink transition-colors hover:bg-ink/[0.03] disabled:cursor-default"
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface text-ink"
        >
          <HelpIcon width={16} height={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex justify-between gap-3">
            <span className="truncate font-bold">{name}</span>
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
        <ChevronRightIcon
          width={16}
          height={16}
          className="shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </motion.button>
      {authoring && (
        <button
          type="button"
          aria-label={`Edit ${name}`}
          onClick={() => setEditing(true)}
          className="absolute right-10 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink-faint hover:bg-ink/5 hover:text-ink"
        >
          <EditIcon width={14} height={14} />
        </button>
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
