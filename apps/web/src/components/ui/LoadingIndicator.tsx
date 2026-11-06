import { useEffect, useState } from 'react';

/** A static SVG remains legible with every motion preference. */
export function LoadingIndicator({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-8 text-ink-faint">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Fast transitions remain quiet; a real wait receives visible feedback. */
export function DelayedLoadingIndicator() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <LoadingIndicator /> : null;
}
