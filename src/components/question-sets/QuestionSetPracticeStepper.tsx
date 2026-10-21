import { useRef, useState } from 'react';
import type { flattenQuestionSet } from '../../questions/questionSetAuthoring';
import type { QuestionSetAttemptRecord } from '../../questions/questionSetAttempts';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';

type Part = ReturnType<typeof flattenQuestionSet>[number];

/**
 * Session-style segments, one per part. Clicking the bar swells the segments into
 * labelled parts in place; choosing one moves there and settles the bar again.
 */
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
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const segments = useRef<HTMLDivElement>(null);
  const [motionSpeed] = useMotionSpeed();
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => toggle.current?.focus());
  };
  const status = (node: Part, partIndex: number) => {
    if (partIndex === index) return 'current';
    const allocations = node.node.answer!.allocations;
    const done =
      attempt.status === 'answering'
        ? attempt.responses.find((row) => row.nodeId === node.id)?.submitted
        : allocations.every((row) => attempt.decisions.some((d) => d.allocationId === row.id));
    return done ? 'done' : 'todo';
  };
  return (
    <div
      className="qs-part-stepper"
      data-open={open || undefined}
      style={{ ['--qs-step-ms' as string]: `${320 * speedMultiplier(motionSpeed)}ms` }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) close(false);
      }}
    >
      <div
        ref={segments}
        className="qs-part-segments"
        inert={!open}
        aria-label="Parts"
        role="group"
      >
        {nodes.map((node, partIndex) => (
          <button
            key={node.id}
            type="button"
            className="qs-part-segment"
            data-status={status(node, partIndex)}
            aria-current={partIndex === index ? 'step' : undefined}
            disabled={blocked}
            onClick={() => {
              close(true);
              if (partIndex !== index) onMove(node.id);
            }}
          >
            <span>
              {[
                ...node.parentIds.map((id) => allNodes.find((row) => row.id === id)!.label),
                node.label,
              ].join(' ')}
            </span>
          </button>
        ))}
      </div>
      {!open && (
        <button
          ref={toggle}
          type="button"
          className="qs-part-toggle"
          aria-expanded={false}
          aria-label={[
            `${mode === 'paper' ? 'Paper' : 'Practice'}, part ${index + 1} of ${nodes.length}`,
            context,
          ]
            .filter(Boolean)
            .join(', ')}
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() =>
              segments.current?.querySelector<HTMLElement>('[aria-current]')?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
