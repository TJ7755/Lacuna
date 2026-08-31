import { Link, NavLink } from 'react-router-dom';
import { LacunaIcon } from '../ui/icons';

export function PublicHeader() {
  const inElectron = window.electronAPI?.isElectron === true;

  return (
    <nav
      aria-label="Public navigation"
      className="mx-auto flex w-full max-w-5xl items-center justify-between gap-5 px-6 py-5 sm:px-10"
    >
      <Link
        to="/welcome"
        className="flex min-h-11 items-center gap-2.5 rounded-lg font-display text-xl tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
          <LacunaIcon className="size-5" />
        </span>
        Lacuna
      </Link>

      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] sm:gap-4">
        {!inElectron && (
          <NavLink
            to="/download"
            className={({ isActive }) =>
              'hidden min-h-10 items-center rounded-lg px-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:inline-flex ' +
              (isActive ? 'text-accent' : 'text-ink-soft')
            }
          >
            Download
          </NavLink>
        )}
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-lg border border-line-strong bg-surface-raised px-3.5 text-ink shadow-sm shadow-black/5 transition-colors hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Open Lacuna
        </Link>
      </div>
    </nav>
  );
}
