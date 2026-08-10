import { Link, useLocation } from 'react-router-dom';

export function NotFound() {
  const location = useLocation();

  return (
    <div className="flex min-h-full items-center justify-center p-6 sm:p-10">
      <section className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-8 shadow-sm sm:p-10">
        <div className="absolute inset-0 bg-dot-grid opacity-30" aria-hidden="true" />
        <div className="relative space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">404 · Missing page</p>
          <div className="space-y-2">
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl">This page is not on the path.</h1>
            <p className="max-w-lg text-ink-soft">
              Lacuna could not find <code className="rounded bg-ink/5 px-1.5 py-0.5 text-sm text-ink">{location.pathname}</code>.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
