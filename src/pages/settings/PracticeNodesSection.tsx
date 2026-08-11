import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ChevronRightIcon } from '../../components/ui/icons';
import { useLessons, usePracticeNodes } from '../../state/useCourseData';

export interface PracticeNodesSectionProps {
  courseId: string;
}

/**
 * Practice-node summary. The path is the canonical authoring surface because
 * placement is meaningless without seeing the curriculum around it. Settings
 * explains the automatic/manual distinction and links to that editor rather
 * than maintaining a second full editing workflow.
 */
export function PracticeNodesSection({ courseId }: PracticeNodesSectionProps) {
  const navigate = useNavigate();
  const lessons = useLessons(courseId);
  const practiceNodes = usePracticeNodes(courseId);
  const manualNodes = practiceNodes?.filter((n) => n.type === 'manual');

  function describePosition(position: number | undefined): string {
    if (position === undefined) return 'Start of course';
    const sorted = [...(lessons ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    let after: string | null = null;
    for (const lesson of sorted) {
      if (lesson.orderIndex <= position) after = lesson.name;
    }
    return after ? `After "${after}"` : 'Start of course';
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-faint">
        Automatic practice appears when due work builds up and follows the thresholds above.
        Manual practice is placed deliberately on the course path and can limit lessons, card count
        and order. Custom card filters are not editable.
      </p>

      {manualNodes?.length === 0 && (
        <p className="text-xs text-ink-faint">No manual practice nodes yet.</p>
      )}

      {manualNodes?.map((node) => (
        <div
          key={node.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
        >
          <div className="min-w-0">
            <div className="text-sm text-ink">{node.name}</div>
            <div className="mt-0.5 text-xs text-ink-faint">
              {describePosition(node.position)}
              {node.lessonIds && node.lessonIds.length > 0
                ? ` · ${node.lessonIds.length} lesson${node.lessonIds.length === 1 ? '' : 's'}`
                : ' · all lessons'}
              {node.cardCount ? ` · ${node.cardCount} cards` : ''}
              {node.randomize ? ' · randomised' : ''}
            </div>
          </div>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => navigate(`/course/${courseId}`)}
      >
        Manage on Path
        <ChevronRightIcon width={16} height={16} />
      </Button>
    </div>
  );
}
