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
  const [editingQueued, setEditingQueued] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setContent(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!queuedFollowUp) setEditingQueued(false);
  }, [queuedFollowUp]);

  function editQueuedFollowUp() {
    if (!queuedFollowUp || disabled) return;
    dirtyRef.current = true;
    setEditingQueued(true);
    setContent(queuedFollowUp);
    inputRef.current?.focus();
  }

  async function send() {
    const message = content.trim();
    if (!message || disabled || sending) return;
    setSending(true);
    try {
      const result = await session.send(message);
      if (result.ok) {
        dirtyRef.current = false;
        setEditingQueued(false);
        setContent('');
      }
    } catch {
      // Keep the draft available; session adapters surface connection errors in their snapshot.
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-line bg-surface p-3">
      {queuedFollowUp && !editingQueued && (
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-line bg-paper pl-3 text-xs text-ink-soft">
          <div className="min-w-0 flex-1 py-2">
            <span className="font-medium text-ink">Queued next</span>
            <p className="mt-0.5 line-clamp-2">{queuedFollowUp}</p>
          </div>
          <button
            type="button"
            aria-label="Edit queued follow-up"
            disabled={disabled}
            onClick={editQueuedFollowUp}
            className="min-h-11 shrink-0 px-3 font-medium text-accent hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            Edit
          </button>
        </div>
      )}
      {editingQueued && (
        <p className="mb-2 text-xs font-medium text-accent">Editing queued follow-up</p>
      )}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-paper shadow-sm transition-colors focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/10">
        <textarea
          ref={inputRef}
          rows={2}
          value={content}
          disabled={disabled}
          aria-label="Message AI"
          placeholder={disabled ? 'Connect an AI session to begin' : 'Message AI…'}
          onChange={(event) => {
            dirtyRef.current = true;
            setContent(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          className="block max-h-36 min-h-[68px] w-full resize-none bg-transparent px-3 py-3 text-sm text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
        />
        <div
          role="group"
          aria-label="Message actions"
          className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5"
        >
          <span className="px-1 text-[10px] text-ink-faint">Shift+Enter for a new line</span>
          <button
            type="button"
            aria-label="Send message"
            disabled={disabled || sending || content.trim().length === 0}
            onClick={() => void send()}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-accent px-2 text-xs font-medium text-accent-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
