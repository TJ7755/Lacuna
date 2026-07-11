// The path-node registry switch (addendum K).
//
// Renders a PathNode by dispatching on its nodeType. It switches exhaustively
// over the node types this build knows about (full TypeScript safety) and falls
// back to a small neutral placeholder for any unrecognised type — so a course
// exported by a future build with plugin node types still renders without
// crashing or silently dropping nodes.
//
// British English throughout.

import type { PathNode, PracticePathNode } from '../../course/path';
import { LessonNode } from './LessonNode';
import { CheckpointNode } from './CheckpointNode';
import { PracticeNode } from './PracticeNode';

interface PathNodeViewProps {
  node: PathNode;
  onLessonClick?: (lessonId: string) => void;
  onPracticeClick?: () => void;
  /** Only ever invoked for `practice-manual` nodes — see PracticeNode.tsx. */
  onPracticeEdit?: (node: PracticePathNode) => void;
}

/** A neutral placeholder for node types this build does not recognise. */
function UnrecognisedNode() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-line bg-surface text-ink-faint"
        role="img"
        aria-label="Unrecognised step"
      >
        <span className="text-lg font-semibold">?</span>
      </div>
      <span className="max-w-[7rem] text-center text-xs font-medium leading-tight text-ink-faint">
        Unrecognised step
      </span>
    </div>
  );
}

export function PathNodeView({
  node,
  onLessonClick,
  onPracticeClick,
  onPracticeEdit,
}: PathNodeViewProps) {
  switch (node.nodeType) {
    case 'lesson':
      return (
        <LessonNode
          lesson={node.lesson}
          status={node.status}
          onClick={
            onLessonClick ? () => onLessonClick(node.lesson.id) : undefined
          }
        />
      );
    case 'checkpoint':
      return <CheckpointNode examDate={node.examDate} />;
    case 'practice-auto':
    case 'practice-manual':
      return (
        <PracticeNode
          node={node}
          onClick={onPracticeClick}
          onEdit={
            node.nodeType === 'practice-manual' && onPracticeEdit
              ? () => onPracticeEdit(node)
              : undefined
          }
        />
      );
    default:
      // Any nodeType outside KNOWN_NODE_TYPES (e.g. a future plugin type).
      return <UnrecognisedNode />;
  }
}
