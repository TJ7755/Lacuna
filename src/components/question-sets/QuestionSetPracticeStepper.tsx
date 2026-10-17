import type { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { Menu } from '../ui/Menu';

type Part = ReturnType<typeof flattenQuestionSet>[number];

export function QuestionSetPracticeStepper({
  mode,
  nodes,
  allNodes,
  attempt,
  index,
  blocked,
  onMove,
  context,
}: {
  mode: QuestionSetAttemptRecord['mode'];
  nodes: Part[];
  allNodes: Part[];
  attempt: QuestionSetAttemptRecord;
  index: number;
  blocked: boolean;
  onMove: (id: string) => void;
  context?: string;
}) {
  return (
    <Menu
      className="qs-part-stepper"
      label={[
        `${mode === 'paper' ? 'Paper' : 'Practice'}, part ${index + 1} of ${nodes.length}`,
        context,
      ]
        .filter(Boolean)
        .join(', ')}
      triggerWidth={Math.min(144, Math.max(44, nodes.length * 14 + 24))}
      items={nodes.map((node) => ({
        label: [
          ...node.parentIds.map((id) => allNodes.find((row) => row.id === id)!.label),
          node.label,
          ...(attempt.responses.find((row) => row.nodeId === node.id)?.submitted
            ? ['· submitted']
            : []),
        ].join(' '),
        disabled: blocked,
        onSelect: () => onMove(node.id),
      }))}
    >
      <span className="qs-part-dots" aria-hidden="true">
        {nodes.map((node, partIndex) => (
          <span
            key={node.id}
            className="qs-part-dot"
            data-current={partIndex === index || undefined}
            data-submitted={
              Boolean(attempt.responses.find((row) => row.nodeId === node.id)?.submitted) ||
              undefined
            }
          />
        ))}
      </span>
    </Menu>
  );
}
