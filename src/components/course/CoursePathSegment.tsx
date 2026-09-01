// Path-segment rendering for CoursePath.tsx: a single node and its connecting
// line. Extracted out of the page so CoursePath.tsx stays focused on data
// loading and layout.
//
// British English throughout.

import type { Course } from '../../db/types';
import type { PathNode, PracticePathNode } from '../../course/path';
import type { AssessmentPracticeOption } from '../../course/assessmentPractice';
import type { LessonNodeDetail } from './LessonNode';
import { PathNodeView } from './PathNodeView';
import { PathLine } from './PathLine';
import { formatDate } from '../../utils/datetime';
import type { LessonReorderInteraction } from './useLessonPathReorder';

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
 * indicating the student has already cleared that stretch of the path.
 */
export function PathNodeWithLine({
  node,
  isLast,
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
  authoring,
  archivedInspection,
  lessonReorder,
}: {
  node: PathNode;
  isLast: boolean;
  current: boolean;
  lockHint?: string;
  lessonDetail?: LessonNodeDetail;
  practiceProgress?: { fraction: number; completed: boolean };
  practiceAssessment?: AssessmentPracticeOption;
  onLessonClick?: (lessonId: string) => void;
  onPracticeClick?: (node: PracticePathNode) => void;
  onPracticeAssessmentClick?: (assessmentId: string) => void;
  onCheckpointClick?: (assessmentId: string) => void;
  onPracticeEdit?: (node: PracticePathNode) => void;
  authoring: boolean;
  archivedInspection?: boolean;
  lessonReorder?: LessonReorderInteraction;
}) {
  // A segment is completed when the node it trails is a completed lesson.
  // Checkpoints and available/locked lessons leave the segment neutral.
  const segmentCompleted = !isLast && node.nodeType === 'lesson' && node.status === 'completed';

  return (
    <div className="relative flex flex-col items-center">
      <PathNodeView
        node={node}
        current={current}
        lockHint={lockHint}
        lessonDetail={lessonDetail}
        practiceProgress={practiceProgress}
        practiceAssessment={practiceAssessment}
        onLessonClick={onLessonClick}
        onPracticeClick={
          onPracticeClick &&
          (node.nodeType === 'practice-auto' || node.nodeType === 'practice-manual')
            ? () => onPracticeClick(node)
            : undefined
        }
        onPracticeAssessmentClick={
          practiceAssessment && onPracticeAssessmentClick
            ? () => onPracticeAssessmentClick(practiceAssessment.assessmentId)
            : undefined
        }
        onCheckpointClick={
          node.nodeType === 'checkpoint' && onCheckpointClick
            ? () => onCheckpointClick(node.assessment.id)
            : undefined
        }
        onPracticeEdit={authoring ? onPracticeEdit : undefined}
        authoring={authoring}
        archivedInspection={archivedInspection}
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
      {!isLast && <PathLine completed={segmentCompleted} />}
    </div>
  );
}
