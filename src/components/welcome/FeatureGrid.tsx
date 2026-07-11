import type { ReactNode } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

/** Small stroke-based glyphs, one per feature, matching the line-icon style used elsewhere on the page. */
const ICONS: Record<string, ReactNode> = {
  'Local only': (
    <path d="M2.5 6.5 8 2.5l5.5 4v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" strokeLinejoin="round" />
  ),
  'Card types': (
    <>
      <rect x="2.5" y="3.5" width="8" height="6" rx="1.2" />
      <rect x="5.5" y="6.5" width="8" height="6" rx="1.2" />
    </>
  ),
  'Rich notes': (
    <>
      <path d="M3 2.5h7l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      <path d="M5 8h6M5 10.5h4" strokeLinecap="round" />
    </>
  ),
  'Simple mode': <path d="M3 8.5 6 11.5 13 3.5" strokeLinecap="round" strokeLinejoin="round" />,
  Analytics: (
    <>
      <path d="M2.5 13V2.5" strokeLinecap="round" />
      <path d="M2.5 13h11" strokeLinecap="round" />
      <path d="M4.5 10.5 7 7.5l2 2 3.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  'Question bank': (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M6.2 6.2a1.8 1.8 0 0 1 3.4.8c0 1.2-1.6 1.3-1.6 2.5" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.15" fill="currentColor" stroke="none" />
    </>
  ),
  'Touch first': (
    <>
      <path d="M6 8.5V3.8a1 1 0 0 1 2 0V8" />
      <path d="M8 8V3.3a1 1 0 0 1 2 0V8" />
      <path d="M10 8.2V4.3a1 1 0 0 1 2 0V9" />
      <path d="M6 8.5 4.6 7.2a1 1 0 0 0-1.5 1.3l2.3 3.3A3.5 3.5 0 0 0 8.3 13.2H9a3 3 0 0 0 3-3V9" strokeLinejoin="round" />
    </>
  ),
  Portable: (
    <>
      <rect x="2.8" y="5.5" width="10.4" height="8" rx="1.2" />
      <path d="M5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
    </>
  ),
};

const FEATURES: Array<{ name: string; detail: string }> = [
  { name: 'Local only', detail: 'Everything lives in your browser. No server, no account, no network.' },
  { name: 'Card types', detail: 'Basic, reversed, cloze deletions and typed answers.' },
  { name: 'Rich notes', detail: 'Markdown with maths, code highlighting and inline images.' },
  { name: 'Simple mode', detail: 'An algorithm-free Yes/No loop when you just want to drill.' },
  { name: 'Analytics', detail: 'Predicted trajectory, stability and review volume per course.' },
  { name: 'Question bank', detail: 'Every card in a course, searchable and editable in one place.' },
  { name: 'Touch first', detail: 'Swipes, bottom sheets and generous targets on every screen.' },
  { name: 'Portable', detail: 'Import and export a whole course as a single JSON file.' },
];

/** Feature grid with a per-card staggered reveal, an icon glyph and an accent-tinted hover. */
export function FeatureGrid() {
  const { ref, visible } = useRevealOnScroll<HTMLUListElement>();
  return (
    <ul ref={ref} className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
      {FEATURES.map((f, i) => (
        <li
          key={f.name}
          className={
            'reveal group/card bg-surface p-5 transition-colors hover:bg-accent-soft/40 ' +
            (visible ? 'reveal-visible' : '')
          }
          style={{ transitionDelay: visible ? `${i * 70}ms` : undefined }}
        >
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 16 16"
              className="size-4 shrink-0 text-ink-faint transition duration-300 ease-out group-hover/card:translate-x-0.5 group-hover/card:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {ICONS[f.name]}
            </svg>
            <h3 className="font-body text-sm font-semibold tracking-normal">{f.name}</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft transition-colors duration-300 group-hover/card:text-ink">
            {f.detail}
          </p>
        </li>
      ))}
    </ul>
  );
}
