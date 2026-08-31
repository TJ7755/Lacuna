import { useEffect, useRef } from 'react';
import type { AiEntityReference } from '../../ai/protocol';
import type { AiConversationItem } from '../../ai/session/types';
import { AiActivityReceipt } from './AiActivityReceipt';
import { MarkdownView } from '../markdown/MarkdownView';

function targetHref(source: AiEntityReference): string | null {
  if (source.kind === 'course') return `#/course/${source.id}`;
  return null;
}

export function AiConversation({ items }: { items: readonly AiConversationItem[] }) {
  const logRef = useRef<HTMLDivElement>(null);
  const lastItemId = items[items.length - 1]?.id;

  useEffect(() => {
    const log = logRef.current;
    if (lastItemId && log) log.scrollTop = log.scrollHeight;
  }, [lastItemId]);

  if (items.length === 0) {
    return (
      <div className="grid flex-1 place-items-center px-8 py-12 text-center">
        <div className="max-w-xs">
          <p className="font-display text-xl text-ink">What are you working on?</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Chat with your connected terminal agent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={logRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
    >
      {items.map((item) => {
        if (item.kind === 'user') {
          return (
            <article
              key={item.id}
              aria-label="Your message"
              data-speaker="user"
              className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft px-4 py-3 text-accent-ink shadow-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent-ink/70">
                You
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                {item.content}
              </p>
            </article>
          );
        }
        if (item.kind === 'assistant') {
          return (
            <article
              key={item.id}
              aria-label="AI response"
              data-speaker="assistant"
              className="mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface-raised px-4 py-3 text-ink shadow-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
                AI
              </p>
              <MarkdownView source={item.content} className="mt-1 break-words text-sm leading-6" />
              {item.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.sources.map((source) => {
                    const href = targetHref(source);
                    return href ? (
                      <a
                        key={`${source.kind}-${source.id}`}
                        href={href}
                        className="inline-flex min-h-11 items-center rounded-full border border-line px-2.5 text-xs text-ink-soft hover:border-accent/50 hover:text-accent"
                      >
                        {source.label}
                      </a>
                    ) : (
                      <span
                        key={`${source.kind}-${source.id}`}
                        className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft"
                      >
                        {source.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </article>
          );
        }
        if (item.kind === 'receipt') {
          return <AiActivityReceipt key={item.id} receipt={item.receipt} />;
        }
        return (
          <article key={item.id} className="rounded-xl border border-negative/30 bg-negative/5 p-3">
            <p className="text-sm font-medium text-negative">AI could not continue</p>
            <p className="mt-1 text-sm text-ink-soft">
              {'message' in item.error ? item.error.message : item.error.error.message}
            </p>
          </article>
        );
      })}
    </div>
  );
}
