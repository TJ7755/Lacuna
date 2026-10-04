import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'motion/react';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { Link, useLocation } from 'react-router-dom';
import type { QuestionSetPathNode } from '../../course/path';
import { useQuestionSetPathData } from './useQuestionSetPathData';
import { questionSetPathProgress } from '../../questions/questionSetPathProgress';
import { FileTextIcon } from '../ui/icons';
import { Button } from '../ui/Button';
import { QuestionSetPathEditor } from './QuestionSetPathEditor';
import './question-set-path.css';

export function QuestionSetPathActivity({
  node,
  authoring = false,
}: {
  node: QuestionSetPathNode;
  authoring?: boolean;
}) {
  const location = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const touchReveal = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [motionSpeed] = useMotionSpeed();
  const multiplier = speedMultiplier(motionSpeed);
  const expanded = hovered || focused || touchOpen;
  useEffect(() => {
    if (!touchOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setTouchOpen(false);
        setFocused(false);
        setHovered(false);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [touchOpen]);
  const [editing, setEditing] = useState(false);
  const courseId = node.practiceNode.courseId;
  const data = useQuestionSetPathData(node);
  if (!data) return <p className="text-xs text-ink-soft">Loading Practice Qs…</p>;
  if (!data.content) return <p className="text-xs text-ink-soft">Question set unavailable</p>;
  const progress = questionSetPathProgress(data.attempt);
  return (
    <div
      ref={root}
      className="qs-path-activity"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && !editing) {
          event.stopPropagation();
          setHovered(false);
          setFocused(false);
          setTouchOpen(false);
        }
      }}
    >
      <div className="qs-path-activity-slot">
        <motion.div
          className="qs-path-activity-surface"
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') setHovered(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') setHovered(false);
          }}
          data-expanded={expanded}
          initial={false}
          animate={{
            width: expanded ? 200 : 56,
            height: expanded ? (data.exam || authoring ? 120 : 84) : 56,
            borderRadius: expanded ? 22 : 28,
          }}
          style={{ x: '-50%', y: '-50%' }}
          transition={
            multiplier === 0
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 32 * multiplier }
          }
        >
          <Link
            className="qs-path-activity-link"
            aria-label={`Practice Qs ${data.content.title}`}
            to={`/course/${courseId}/question-sets/${node.questionSetId}`}
            state={{
              questionSetReturnTo: location.pathname + location.search,
              questionSetReturnLabel: 'Back to path',
            }}
            onPointerDown={(event) => {
              touchReveal.current = event.pointerType === 'touch' && !expanded;
            }}
            onClick={(event) => {
              if (touchReveal.current) {
                event.preventDefault();
                touchReveal.current = false;
                setTouchOpen(true);
              }
            }}
          >
            <span className="sr-only">Practice Qs</span>
            {!expanded && <FileTextIcon width={24} height={24} />}
            {expanded && (
              <motion.span
                className="qs-path-activity-detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 * multiplier, delay: 0.06 * multiplier }}
              >
                <strong>{data.content.title}</strong>
                <small>
                  {progress
                    ? `${progress.answeredParts}/${progress.totalParts} answered · ${progress.markedParts} marked`
                    : 'No attempts yet'}
                </small>
              </motion.span>
            )}
          </Link>
          {expanded && (data.exam || authoring) && (
            <div className="qs-path-activity-actions">
              {data.exam && (
                <Link
                  className="text-xs text-accent"
                  to={`/course/${courseId}?exam=${encodeURIComponent(data.exam.id)}`}
                >
                  {data.exam.name}
                </Link>
              )}
              {authoring && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Edit activity
                </Button>
              )}
            </div>
          )}
        </motion.div>
      </div>
      <span className="qs-path-activity-caption" aria-hidden="true">
        {data.content.title}
      </span>
      {editing && (
        <QuestionSetPathEditor
          courseId={courseId}
          node={node.practiceNode}
          onClose={() => {
            setEditing(false);
            requestAnimationFrame(() =>
              root.current?.querySelector<HTMLAnchorElement>('.qs-path-activity-link')?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
