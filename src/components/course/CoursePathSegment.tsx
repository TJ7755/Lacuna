// Path-segment rendering for CoursePath.tsx: a single node, its connecting
// line, and the labelled affordances for inserting a manual
// practice node. Extracted out of the page so CoursePath.tsx stays focused on
// data loading and layout.
//
// British English throughout.

import type { Course } from '../../db/types';
import type { PathNode, PracticePathNode } from '../../course/path';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { LessonNodeDetail } from './LessonNode';
import { PathNodeView } from './PathNodeView';
import { PathLine } from './PathLine';
import { PlusIcon } from '../ui/icons';
import { formatDate } from '../../utils/datetime';
import type { LessonReorderInteraction } from './useLessonPathReorder';

/** Whether the line/gap right after `nodes[i]` should offer a practice-node insertion point. */
export interface LineInsert {
  insertable: boolean;
  position?: number;
}

/**
 * Precomputes, for the line following each node, whether inserting a manual
 * practice node there is meaningful and which `position` it should carry.
 *
 * A gap is only ever meaningful at a lesson boundary (manual placement keys off
 * lesson `orderIndex`, see buildPath/practiceGateAfterLesson), so this only marks
 * the line immediately preceding the *next* lesson node as insertable — even when
 * several checkpoint/practice nodes sit between two lessons, only one insertion
 * point renders for that whole stretch.
 */
export function computeLineInserts(nodes: PathNode[]): LineInsert[] {
  const result: LineInsert[] = [];
  let lastLessonOrder: number | undefined;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.nodeType === 'lesson') lastLessonOrder = node.lesson.orderIndex;
    const next = nodes[i + 1];
    result.push(
      next && next.nodeType === 'lesson'
        ? { insertable: true, position: lastLessonOrder }
        : { insertable: false },
    );
  }
  return result;
}

/**
 * A quiet hint for why a locked lesson isn't available yet, shown as its
 * title tooltip (see LessonNode). `open` mode never locks anything, so it has
 * no hint; `linear` names the release date; `semi-linear`'s ratchet has no
 * single stored trigger to point at, so it names the mechanism in general terms.
 */
export function lockHintFor(
  course: Course,
  lessonId: string,
  effectiveDates: Map<string, number | undefined>,
): string | undefined {
  switch (course.unlockMode) {
    case 'linear': {
      const date = effectiveDates.get(lessonId);
      return date ? `Unlocks ${formatDate(date, course.timeZone)}` : undefined;
    }
    case 'semi-linear':
      return 'Unlocks once the lesson before it is complete';
    default:
      return undefined;
  }
}

/**
 * Renders a single path node followed by its connecting line (if not the last node).
 * The connecting line is accent-tinted when the preceding node is a completed lesson,
 * indicating the student has already cleared that stretch of the path. When
 * `lineInsert.insertable` and `authoring`, the line also carries a labelled
 * affordance for inserting a manual practice node at that gap.
 */
export function PathNodeWithLine({
  node,
  isLast,
  lineInsert,
  current,
  lockHint,
  lessonDetail,
  practiceProgress,
  practiceAssessment,
  onLessonClick,
  onPracticeClick,
  onPracticeAssessmentClick,
  onCheckpointClick,
  onPracticeEdit,
  onInsertOnLine,
  authoring,
  lessonReorder,
}: {
  node: PathNode;
  isLast: boolean;
  lineInsert: LineInsert;
  current: boolean;
  lockHint?: string;
  lessonDetail?: LessonNodeDetail;
  practiceProgress?: { fraction: number; completed: boolean };
  practiceAssessment?: AssessmentPracticeOption;
  onLessonClick: (lessonId: string) => void;
  onPracticeClick: (node: PracticePathNode) => void;
  onPracticeAssessmentClick: (assessmentId: string) => void;
  onCheckpointClick: (assessmentId: string) => void;
  onPracticeEdit: (node: PracticePathNode) => void;
  onInsertOnLine: (position: number | undefined) => void;
  authoring: boolean;
  lessonReorder?: LessonReorderInteraction;
}) {
  // A segment is completed when the node it trails is a completed lesson.
  // Checkpoints and available/locked lessons leave the segment neutral.
  const segmentCompleted = !isLast && node.nodeType === 'lesson' && node.status === 'completed';

  return (
    <div
      className="relative flex flex-col items-center"
    >
      <PathNodeView
        node={node}
        current={current}
        lockHint={lockHint}
        lessonDetail={lessonDetail}
        practiceProgress={practiceProgress}
        practiceAssessment={practiceAssessment}
        onLessonClick={onLessonClick}
        onPracticeClick={
          node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual'
            ? () => onPracticeClick(node)
            : undefined
        }
        onPracticeAssessmentClick={
          practiceAssessment
            ? () => onPracticeAssessmentClick(practiceAssessment.assessmentId)
            : undefined
        }
        onCheckpointClick={
          node.nodeType === 'checkpoint' ? () => onCheckpointClick(node.assessment.id) : undefined
        }
        onPracticeEdit={onPracticeEdit}
        authoring={authoring}
        lessonReorder={lessonReorder}
      />
      {lessonReorder?.dropMarker && (
        <div
          aria-hidden="true"
          className={
            'pointer-events-none absolute left-1/2 z-30 h-1 w-24 -translate-x-1/2 rounded-full bg-accent shadow-sm shadow-accent/30 ' +
            (lessonReorder.dropMarker === 'before' ? '-top-3' : 'top-[5.75rem]')
          }
        />
      )}
      {!isLast && (
        <div className="relative">
          <PathLine completed={segmentCompleted} />
          {authoring && lineInsert.insertable && (
            <InsertButton onInsert={() => onInsertOnLine(lineInsert.position)} />
          )}
        </div>
      )}
    </div>
  );
}

/** A persistent control for inserting a manual practice node at a specific path gap. */
function InsertButton({ onInsert }: { onInsert: () => void }) {
  return (
    <button
      type="button"
      onClick={onInsert}
      aria-label="Add manual practice here"
      className="absolute left-1/2 top-1/2 z-10 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-line-strong bg-surface px-2 text-[0.65rem] font-medium text-ink-faint shadow-sm transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <PlusIcon width={12} height={12} />
      Manual practice
    </button>
  );
}

/** The start/end insertion points, where there is no existing connecting line to anchor to. */
export function InsertGap({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="relative h-8 w-1">
      <InsertButton onInsert={onInsert} />
    </div>
  );
}
