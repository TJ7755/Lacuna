import { ConfirmInline } from '../ui/ConfirmInline';
import type { McpConsentRequest } from '../../mcp/bridge/protocol';

interface McpConsentPromptProps {
  request: McpConsentRequest;
  courseName: string;
  onDecision: (approved: boolean) => void;
}

export function McpConsentPrompt({ request, courseName, onDecision }: McpConsentPromptProps) {
  const destructive = request.scope === 'destructive';
  return (
    <div className="fixed left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[70] mx-auto max-w-xl rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">MCP access request</p>
      <h2 className="mt-1 font-display text-lg text-ink">
        Allow {destructive ? 'destructive' : 'write'} access to {courseName}?
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        {request.client?.name ?? 'An MCP client'} wants to run <code className="text-ink">{request.tool}</code>.
        {' '}This permission lasts until that client disconnects.
      </p>
      <ConfirmInline
        className="mt-4 justify-end"
        message={destructive ? 'This can remove or bulk-change data.' : 'This can create or change content.'}
        confirmLabel="Allow"
        onConfirm={() => onDecision(true)}
        onCancel={() => onDecision(false)}
        variant={destructive ? 'destructive' : 'default'}
      />
    </div>
  );
}
