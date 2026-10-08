import { buttonClassName } from '../components/ui/buttonStyles';
import { Link, useLocation } from 'react-router-dom';
import { SECTION_CARD_SURFACE_CLASS } from '../components/ui/SectionCard';

export function NotFound() {
  const location = useLocation();

  return (
    <div className="flex min-h-full items-center justify-center p-6 sm:p-10">
      <section className={`${SECTION_CARD_SURFACE_CLASS} relative w-full max-w-xl overflow-hidden p-8 sm:p-10`}>
        <div className="relative space-y-5">
          <div className="space-y-2">
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl">This page is not on the path.</h1>
            <p className="max-w-lg text-ink-soft">
              Lacuna could not find <code className="rounded bg-ink/5 px-1.5 py-0.5 text-sm text-ink">{location.pathname}</code>.
            </p>
          </div>
          <Link
            to="/"
            className={buttonClassName('primary')}
          >
            Back to Today
          </Link>
        </div>
      </section>
    </div>
  );
}
