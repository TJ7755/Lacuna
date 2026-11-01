import { useEffect } from 'react';

/** Scroll to a recognised page section, including nested HashRouter fragments. */
export function useSectionDeepLink(allowedIds: ReadonlySet<string>) {
  useEffect(() => {
    function scrollToDeepLink() {
      const hash = window.location.hash;
      const fragment = hash.slice(hash.lastIndexOf('#') + 1);
      if (!fragment || fragment.startsWith('/')) return;
      let id: string;
      try {
        id = decodeURIComponent(fragment);
      } catch {
        return;
      }
      if (allowedIds.has(id)) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }

    scrollToDeepLink();
    window.addEventListener('hashchange', scrollToDeepLink);
    return () => window.removeEventListener('hashchange', scrollToDeepLink);
  }, [allowedIds]);
}
