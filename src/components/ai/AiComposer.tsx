import { useEffect, useRef, useState } from 'react';
import type { AiSession } from '../../ai/session/types';

interface AiComposerProps {
  session: AiSession;
  disabled: boolean;
  initialDraft: string;
  queuedFollowUp: string | null;
  autoFocus: boolean;
}

export function AiComposer({
  session,
  disabled,
  initialDraft,
  queuedFollowUp,
  autoFocus,
}: AiComposerProps) {
  const [content, setContent] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function send() {
    const message = content.trim();
    if (!message || disabled || sending) return;
    setSending(true);
    const result = await session.send(message);
    setSending(false);
    if (result.ok) setContent('');
  }

  return (
    <div className="border-t border-line bg-surface p-3">
      {queuedFollowUp && (
        <div className="mb-2 rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-soft">
          <span className="font-medium text-ink">Queued next</span>
          <p className="mt-0.5 line-clamp-2">{queuedFollowUp}</p>
        </div>
      )}
      <div className="relative rounded-xl border border-line-strong bg-paper shadow-sm transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10">
        <textarea
          ref={inputRef}
          rows={2}
          value={content}
          disabled={disabled}
          aria-label="Message AI"
          placeholder={disabled ? 'Connect an AI session to begin' : 'Ask about this course or change Lacuna…'}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          className="block max-h-36 min-h-[68px] w-full resize-none bg-transparent px-3 pb-8 pt-3 text-sm text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
        />
        <div className="absolute inset-x-2 bottom-1.5 flex items-center justify-between gap-2">
          <span className="px-1 text-[10px] text-ink-faint">Shift+Enter for a new line</span>
          <button
            type="button"
            aria-label="Send message"
            disabled={disabled || sending || content.trim().length === 0}
            onClick={() => void send()}
            className="flex min-h-8 min-w-8 items-center justify-center rounded-lg bg-accent px-2 text-xs font-medium text-accent-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
