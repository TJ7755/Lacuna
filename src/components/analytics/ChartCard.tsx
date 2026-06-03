import type { ReactNode } from 'react';

/** A titled container giving every chart a consistent frame and empty state. */
export function ChartCard({
  title,
  description,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  description?: string;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <header className="mb-4">
        <h3 className="font-display text-xl tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </header>
      {empty ? (
        <div className="grid h-56 place-items-center text-sm text-ink-faint">
          {emptyMessage ?? 'Not enough data yet.'}
        </div>
      ) : (
        <div className="h-56">{children}</div>
      )}
    </section>
  );
}
