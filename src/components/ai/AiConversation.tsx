import type { AiEntityReference } from '../../ai/protocol';
import type { AiConversationItem } from '../../ai/session/types';
import { MarkdownView } from '../markdown/MarkdownView';
import { CheckIcon } from '../ui/icons';

function targetHref(source: AiEntityReference): string | null {
  if (source.kind === 'course') return `#/course/${source.id}`;
  return null;
}

export function AiConversation({ items }: { items: readonly AiConversationItem[] }) {
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
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
    >
      {items.map((item) => {
        if (item.kind === 'user') {
          return (
            <article key={item.id} className="ml-8 border-l-2 border-accent/35 pl-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">You</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{item.content}</p>
            </article>
          );
        }
        if (item.kind === 'assistant') {
          return (
            <article key={item.id}>
              <p className="text-[11px] uppercase tracking-[0.14em] text-accent">AI</p>
              <MarkdownView source={item.content} className="mt-1 text-sm leading-6 text-ink" />
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
          return (
            <article
              key={item.id}
              className="rounded-xl border border-line bg-surface-raised/60 p-3"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-positive/10 text-positive">
                  <CheckIcon width={14} height={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{item.receipt.summary}</p>
                  <p className="mt-1 text-xs text-ink-faint">{item.receipt.toolName}</p>
                </div>
              </div>
            </article>
          );
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
