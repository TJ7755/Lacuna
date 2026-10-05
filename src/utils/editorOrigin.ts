import { useCallback, type MouseEvent } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import type { ReturningState } from '../components/layout/scrollMemory';

/**
 * Router `location.state` shape that sends a page's Back, Cancel or Exit to the
 * exact place the learner came from: the same page, tab, query (search, filters)
 * and, through scroll memory, the same scroll position.
 *
 * Deliberately additive: a page opened without it (a deep link, a refresh, which
 * drops router state) falls back to the destination its route implies.
 */
export interface EditorOrigin {
  /** Path, query and hash of the page to return to. */
  path: string;
  /** Label shown on the back link for that destination. */
  label: string;
  /** The origin's position in browser history, so a return can step back to it. */
  idx?: number;
}

export interface EditorOriginState {
  origin?: EditorOrigin;
}

function historyIndex(): number | undefined {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' ? idx : undefined;
}

/** State to pass when leaving `location` for a page that should be able to come back. */
export function originFrom(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  label: string,
): EditorOriginState {
  return {
    origin: {
      path: `${location.pathname}${location.search}${location.hash}`,
      label,
      idx: historyIndex(),
    },
  };
}

/** `originFrom` for the current page. */
export function useOriginHere(label: string): EditorOriginState {
  return originFrom(useLocation(), label);
}

export interface ReturnTarget {
  /** Where the return goes, for an href. */
  to: string;
  label: string;
  /** Go back to the origin; steps back through history when the origin is in it. */
  goBack: () => void;
  /** Props for a back link: a real href, with a plain click doing `goBack`. */
  linkProps: { to: string; onClick: (event: MouseEvent<HTMLAnchorElement>) => void };
}

/**
 * Where this page returns to. When the learner arrived from an origin that is still
 * in browser history, returning steps back to that entry, so the browser's own
 * Forward and Back stay sensible and the page comes back exactly as it was left.
 * Otherwise it navigates to the origin's path, or to `fallback`, as a return.
 */
export function useReturn(fallback: { path: string; label: string }): ReturnTarget {
  const location = useLocation();
  const navigate = useNavigate();
  const origin = (location.state as EditorOriginState | null)?.origin;
  const to = origin?.path ?? fallback.path;
  const label = origin?.label ?? fallback.label;

  const goBack = useCallback(() => {
    const here = historyIndex();
    if (origin?.idx !== undefined && here !== undefined && here > origin.idx) {
      void navigate(origin.idx - here);
      return;
    }
    const returning: ReturningState = { returning: true };
    void navigate(to, { state: returning });
  }, [navigate, origin?.idx, to]);

  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // Let modified clicks open the link elsewhere, as an ordinary link would.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      goBack();
    },
    [goBack],
  );

  return { to, label, goBack, linkProps: { to, onClick } };
}
