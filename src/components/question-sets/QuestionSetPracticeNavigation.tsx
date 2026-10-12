import { Button } from '../ui/Button';

/** Optional browsing follows the primary task controls in the keyboard order. */
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
        variant="secondary"
        disabled={blocked || index <= 0}
        onClick={() => onMove(rows[index - 1].nodeId, rows[index - 1].allocationId)}
      >
        {marking ? 'Previous criterion' : 'Previous'}
      </Button>
      <Button
        variant="secondary"
        disabled={blocked || index >= rows.length - 1}
        onClick={() => onMove(rows[index + 1].nodeId, rows[index + 1].allocationId)}
      >
        {marking ? 'Next criterion' : 'Next'}
      </Button>
    </nav>
  );
}
