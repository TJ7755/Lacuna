import type { AiApprovalState } from '../../ai/protocol';
import type { AiSession } from '../../ai/session/types';
import { Button } from '../ui/Button';

export function AiApprovalCard({ approval, session }: { approval: AiApprovalState; session: AiSession }) {
  if (approval.status !== 'pending') return null;

  return (
    <section className="mx-4 mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4" aria-labelledby="ai-approval-title">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-warning-fg">
        Permission required
      </p>
      <h2 id="ai-approval-title" className="font-display text-lg text-ink">
        Approve this action?
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{approval.summary}</p>
      <div className="mt-3 rounded-lg border border-line bg-surface/70 px-3 py-2">
        <div className="text-xs text-ink-faint">Target</div>
        <div className="mt-0.5 text-sm font-medium text-ink">{approval.targetLabel}</div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void session.decide(approval.approvalId, false)}>
          Reject
        </Button>
        <Button size="sm" variant="primary" onClick={() => void session.decide(approval.approvalId, true)}>
          Approve
        </Button>
      </div>
    </section>
  );
}
