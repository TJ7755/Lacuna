// Lesson page header: display title (renamable in Edit mode), one meta line,
// and a trailing slot for the mode pill and study actions. Leaner than
// CourseHeader, which carries the course cockpit's schedule row.

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { EditIcon } from '../ui/icons';
import { cn } from '../ui/cn';
import { useActionFocus } from '../../hooks/useActionFocus';

interface LessonHeaderProps {
  title: string;
  /** Enables inline title editing. Omit for read-only/shared content. */
  onRename?: (name: string) => void | Promise<void>;
  /** Small line under the title; callers compose it from real figures. */
  meta?: ReactNode;
  description?: string;
  /**
   * Replaces the rename button with a lesson actions menu; receives the function that
   * starts the in-place rename. `contextMenu` handlers open the same menu from the title.
   */
  actions?: (startRename: () => void) => ReactNode;
  contextMenu?: Pick<HTMLAttributes<HTMLDivElement>, 'onContextMenu' | 'onKeyDown'>;
  /** Right-hand controls: the mode pill and the study actions. */
  children?: ReactNode;
  className?: string;
}

export function LessonHeader({
  title,
  onRename,
  meta,
  description,
  actions,
  contextMenu,
  children,
  className,
}: LessonHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const renameButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const { remember, restore } = useActionFocus();

  useEffect(() => {
    if (!editing) {
      setDraft(title);
      restore(opener.current?.isConnected ? opener.current : renameButton.current);
    }
  }, [editing, title, restore]);

  function start() {
    if (!onRename || saving) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    remember();
    setDraft(title);
    setEditing(true);
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  async function commit() {
    if (!onRename || saving) return;
    const name = draft.trim();
    if (!name || name === title) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onRename(name);
      setEditing(false);
    } catch {
      requestAnimationFrame(() => input.current?.focus());
    } finally {
      setSaving(false);
    }
  }

  return (
    <header className={cn('flex flex-wrap items-end gap-x-6 gap-y-4', className)}>
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
        <div className="flex min-w-0 items-center gap-1" {...contextMenu}>
          {editing ? (
            <input
              ref={input}
              autoFocus
              value={draft}
              disabled={saving}
              aria-label="lesson name"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void commit()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commit();
                if (event.key === 'Escape') cancel();
              }}
              className="min-w-0 flex-1 rounded-xl bg-ink/[0.05] px-3 py-1 font-display text-4xl font-semibold tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60 md:text-[44px] md:leading-[1.05]"
            />
          ) : (
            <h1
              onDoubleClick={start}
              title={onRename ? 'Double-click to rename lesson' : undefined}
              className={cn(
                'min-w-0 break-words font-display text-4xl font-semibold leading-[1.02] tracking-tight text-ink md:text-[44px]',
                onRename && 'cursor-text',
              )}
            >
              {title}
            </h1>
          )}
          {actions?.(start)}
          {onRename && !actions && !editing && (
            <button
              ref={renameButton}
              type="button"
              onClick={start}
              aria-label="Rename lesson"
              title="Rename lesson"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <EditIcon width={17} height={17} />
            </button>
          )}
        </div>
        {meta && <p className="text-ink-soft tabular-nums">{meta}</p>}
        {description && <p className="max-w-prose text-sm text-ink-soft">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}
