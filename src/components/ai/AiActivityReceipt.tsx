import type { AiActionReceipt, AiEntityReference } from '../../ai/protocol';
import { aiEntityExists } from '../../ai/entityAvailability';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckIcon, ClockIcon } from '../ui/icons';

function targetHref(target: AiEntityReference): string | null {
  if (target.kind === 'course' && target.id !== '__global__') return `#/course/${target.id}`;
  if (target.kind === 'lesson' && target.courseId) {
    return `#/course/${target.courseId}/lesson/${target.id}`;
  }
  if (target.kind === 'card' && target.courseId) {
    return `#/course/${target.courseId}/cards/${target.id}/edit`;
  }
  if (target.kind === 'question' && target.courseId) {
    return `#/course/${target.courseId}/questions/${target.id}/edit`;
  }
  if (target.kind === 'assessment' && target.courseId) {
    return `#/course/${target.courseId}/settings#course-settings-assessments`;
  }
  return null;
}

function formatLocalTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AiActivityReceipt({ receipt }: { receipt: AiActionReceipt }) {
  const availableTargets = useLiveQuery(
    () => Promise.all(receipt.targets.map((target) => aiEntityExists(target))),
    [receipt.targets],
  );

  return (
    <article
      aria-label={`Completed action: ${receipt.summary}`}
      className="rounded-xl border border-line bg-surface-raised/60 p-3"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-positive/10 text-positive"
        >
          <CheckIcon width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{receipt.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span className="font-mono">{receipt.toolName}</span>
            <span className="inline-flex items-center gap-1" title="Local time">
              <ClockIcon aria-hidden="true" width={13} height={13} />
              <time dateTime={new Date(receipt.createdAt).toISOString()}>
                {formatLocalTime(receipt.createdAt)}
              </time>
            </span>
          </div>
          {receipt.targets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Action targets">
              {receipt.targets.map((target, index) => {
                const href = targetHref(target);
                const unavailable = availableTargets?.[index] === false;
                return href && !unavailable ? (
                  <a
                    key={`${target.kind}-${target.id}`}
                    href={href}
                    aria-label={`Open ${target.kind} ${target.label}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-2.5 text-xs text-ink-soft hover:border-accent/50 hover:text-accent"
                  >
                    {target.label}
                  </a>
                ) : (
                  <span
                    key={`${target.kind}-${target.id}`}
                    aria-label={
                      unavailable
                        ? `${target.kind} target: ${target.label} (unavailable)`
                        : `${target.kind} target: ${target.label}`
                    }
                    className="inline-flex min-h-11 items-center rounded-full border border-line px-2.5 text-xs text-ink-soft"
                  >
                    {target.label}
                    {unavailable ? ' · Unavailable' : ''}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
