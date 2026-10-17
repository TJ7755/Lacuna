import { Button } from '../ui/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';

/** Quiet browsing shares the card footer with the primary task. */
export function QuestionSetPracticeNavigation({
  rows,
  index,
  marking,
  blocked,
  onMove,
}: {
  rows: { nodeId: string; allocationId?: string }[];
  index: number;
  marking: boolean;
  blocked: boolean;
  onMove: (nodeId: string, allocationId?: string) => void;
}) {
  if (rows.length < 2) return null;
  return (
    <nav className="qs-preview-nav" aria-label={marking ? 'Marking criteria' : 'Answer parts'}>
      <Button
        variant="ghost"
        className="h-11 w-11 p-0"
        aria-label={marking ? 'Previous criterion' : 'Previous'}
        disabled={blocked || index <= 0}
        onClick={() => onMove(rows[index - 1].nodeId, rows[index - 1].allocationId)}
      >
        <ChevronLeftIcon width={18} height={18} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        className="h-11 w-11 p-0"
        aria-label={marking ? 'Next criterion' : 'Next'}
        disabled={blocked || index >= rows.length - 1}
        onClick={() => onMove(rows[index + 1].nodeId, rows[index + 1].allocationId)}
      >
        <ChevronRightIcon width={18} height={18} aria-hidden="true" />
      </Button>
    </nav>
  );
}
