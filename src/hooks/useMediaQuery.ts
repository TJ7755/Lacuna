import { useEffect, useState } from 'react';

/**
 * Tracks whether a CSS media query currently matches, re-evaluating on
 * change. Mirrors the matchMedia + addEventListener('change', ...) pattern
 * used in useInstallPrompt and motionSpeed. Initial state is computed
 * synchronously from window.matchMedia so the first render already reflects
 * the real viewport (this app is a pure client-side SPA, no SSR).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);

    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', onChange);

    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
