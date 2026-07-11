import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

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

/** Feature grid with a per-card staggered reveal and accent-tinted hover. */
export function FeatureGrid() {
  const { ref, visible } = useRevealOnScroll<HTMLUListElement>();
  return (
    <ul ref={ref} className="grid gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
      {FEATURES.map((f, i) => (
        <li
          key={f.name}
          className={
            'reveal bg-surface p-5 transition-colors hover:bg-accent-soft/40 ' +
            (visible ? 'reveal-visible' : '')
          }
          style={{ transitionDelay: visible ? `${i * 70}ms` : undefined }}
        >
          <h3 className="font-body text-sm font-semibold tracking-normal">{f.name}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.detail}</p>
        </li>
      ))}
    </ul>
  );
}
