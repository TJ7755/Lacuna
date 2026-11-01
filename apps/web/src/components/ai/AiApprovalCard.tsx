import { useEffect, useRef, useState, useId } from 'react';
import type { AiApprovalState } from '../../ai/protocol';
import type { AiSession } from '../../ai/session/types';
import { Button } from '../ui/Button';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';

/** "lacuna.delete_course" reads as "Delete course". */
export function actionName(toolName: string): string {
  const words = toolName.replace(/^lacuna\./, '').replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function AiApprovalCard({
  approval,
  session,
  autoFocus,
}: {
  approval: AiApprovalState;
  session: AiSession;
  autoFocus: boolean;
}) {
  const rejectRef = useRef<HTMLButtonElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();

  useEffect(() => {
    if (autoFocus && approval.status === 'pending') rejectRef.current?.focus();
  }, [approval.approvalId, approval.status, autoFocus]);

  if (approval.status !== 'pending') return null;

  const grant = approval.kind === 'write_grant';
  return (
    <section
      className="mx-4 mb-4 rounded-3xl card-surface bg-warning/10 p-4"
      aria-labelledby="ai-approval-title"
    >
      <h2 id="ai-approval-title" className="font-display text-lg text-ink">
        {grant ? 'Allow AI to make changes' : actionName(approval.toolName)}
      </h2>
      <p className="mt-1 break-words text-sm font-medium text-ink">{approval.targetLabel}</p>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        {grant
          ? 'AI can add and change content here until you stop or disconnect.'
          : 'Approves this change only.'}
      </p>
      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        onClick={() => setDetailsOpen((open) => !open)}
        className="mt-2 inline-flex min-h-11 cursor-pointer select-none items-center text-xs text-ink-faint hover:text-ink-soft"
      >
        Technical details
      </button>
      <AnimatedDisclosure open={detailsOpen}>
        <p id={detailsId} className="mt-1 break-all font-mono text-xs text-ink-faint">
          {approval.toolName}
        </p>
      </AnimatedDisclosure>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          ref={rejectRef}
          size="sm"
          variant="ghost"
          onClick={() => void session.decide(approval.approvalId, false)}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void session.decide(approval.approvalId, true)}
        >
          Approve
        </Button>
      </div>
    </section>
  );
}
