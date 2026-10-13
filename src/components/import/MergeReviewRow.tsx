import { useId } from 'react';
import { MarkdownView } from '../markdown/MarkdownView';
import { AnimatedDisclosure } from '../ui/AnimatedDisclosure';
import { ChevronDownIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { toPlainLine, type ReviewRowModel } from './mergeReviewRows';

export interface RowAction {
  label: string;
  emphasis?: boolean;
  onClick: () => void;
}

export function MergeReviewRow({
  row,
  note,
  consequence,
  expanded,
  onToggle,
  primary,
  secondary,
  pending,
}: {
  row: ReviewRowModel;
  note?: string;
  consequence: string;
  expanded: boolean;
  onToggle: () => void;
  primary: RowAction;
  secondary: RowAction;
  pending: boolean;
}) {
  const id = useId();
  const changed = row.fields.filter((field) => field.state !== 'Unchanged');
  const preview = changed[0] ?? row.fields[0];
  return (
    <li data-merge-row={row.key} className="rounded-2xl bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-soft">
              {row.kind === 'lesson' ? 'Lesson' : row.kind === 'note' ? 'Note' : 'Card'}
            </span>
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? 'Collapse detail' : 'Expand detail'}
              aria-expanded={expanded}
              aria-controls={`${id}-detail`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink active:bg-ink/10"
            >
              <ChevronDownIcon
                width={16}
                height={16}
                className={cn('transition-transform', expanded && 'rotate-180')}
              />
            </button>
          </div>
          <p className="mt-0.5 line-clamp-2 break-words text-sm text-ink">{row.title}</p>
          {note && <p className="mt-1 text-xs text-ink-faint">{note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {[primary, secondary].map((action, index) => (
            <button
              key={action.label}
              type="button"
              data-merge-primary={index === 0 || undefined}
              onClick={action.onClick}
              disabled={pending}
              aria-describedby={`${id}-consequence`}
              className={cn(
                'min-h-11 rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:opacity-50',
                action.emphasis
                  ? 'text-accent-ink hover:bg-accent/10 active:bg-accent/15'
                  : 'text-ink-soft hover:bg-ink/5 active:bg-ink/10',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      <p id={`${id}-consequence`} className="mt-2 text-xs text-ink-soft">
        {consequence}
      </p>
      {!expanded && preview && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-xs text-accent-ink">
            {changed.map((field) => `${field.label} · ${field.state}`).join('; ') ||
              'Unchanged content'}
          </p>
          <p className="flex gap-2">
            <span className="shrink-0 text-ink-soft">Current</span>
            <span className="min-w-0 truncate">
              {preview.before ? toPlainLine(preview.before) || 'Attached content' : 'No content'}
            </span>
          </p>
          <p className="flex gap-2">
            <span className="shrink-0 text-ink-soft">Incoming</span>
            <span className="min-w-0 truncate">
              {preview.after ? toPlainLine(preview.after) || 'Attached content' : 'No content'}
            </span>
          </p>
        </div>
      )}
      <AnimatedDisclosure open={expanded} innerClassName="pt-3">
        <div id={`${id}-detail`} className="select-text space-y-3">
          {row.fields.map((field) => (
            <div
              key={field.label}
              className={cn(
                'rounded-xl p-3',
                field.state !== 'Unchanged' ? 'bg-accent-soft' : 'bg-paper',
              )}
            >
              <p className="mb-2 text-sm font-medium text-ink">
                {field.label} · {field.state}
              </p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {(['before', 'after'] as const).map((version) => (
                  <div key={version} className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="mb-1 text-xs font-medium text-ink-soft">
                      {version === 'before' ? 'Current' : 'Incoming'}
                    </p>
                    <div className="text-sm text-ink [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                      {!field[version] ? (
                        <p className="text-ink-soft">No content</p>
                      ) : field.markdown ? (
                        <MarkdownView source={field[version]} />
                      ) : (
                        <p className="whitespace-pre-wrap">{field[version]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AnimatedDisclosure>
    </li>
  );
}
