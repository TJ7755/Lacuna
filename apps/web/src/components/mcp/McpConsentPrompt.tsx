import { useIsPresent } from 'motion/react';
import { DialogPanel } from '../ui/DialogPanel';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { ConfirmInline } from '../ui/ConfirmInline';
import type { McpConsentRequest } from '../../mcp/bridge/protocol';

interface McpConsentPromptProps {
  request: McpConsentRequest;
  courseName: string;
  onDecision: (approved: boolean) => void;
}

export function McpConsentPrompt({ request, courseName, onDecision }: McpConsentPromptProps) {
  const present = useIsPresent();
  const trapRef = useFocusTrap(present, { autoFocusSelector: 'button:last-child' });
  const destructive = request.scope === 'destructive';
  return (
    <DialogPanel
      label={`Allow ${destructive ? 'destructive' : 'write'} access to ${courseName}?`}
      trapRef={trapRef}
      overlayClassName="z-[70]"
      className="max-w-xl overflow-y-auto p-6"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDecision(false);
        }
      }}
    >
      <h2 className="font-display text-xl text-ink">
        Allow {destructive ? 'destructive' : 'write'} access to {courseName}?
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        {request.client?.name ?? 'An MCP client'} wants to run{' '}
        <code className="text-ink">{request.tool}</code>. This permission lasts until that client
        disconnects.
      </p>
      <ConfirmInline
        className="mt-4 justify-end"
        message={
          destructive
            ? 'This can remove or bulk-change data.'
            : 'This can create or change content.'
        }
        confirmLabel="Allow"
        onConfirm={() => onDecision(true)}
        onCancel={() => onDecision(false)}
        variant={destructive ? 'destructive' : 'default'}
      />
    </DialogPanel>
  );
}
