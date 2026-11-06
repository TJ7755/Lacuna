import { useRef, type MouseEvent } from 'react';
import { NavigationGuard, type NavigationGuardHandle } from '../components/ui/NavigationGuard';
import type { ReturnTarget } from '../utils/editorOrigin';

/** Full-page editors retain unsaved work until leaving is explicitly confirmed. */
export function useEditorLeaveGuard<T extends object>(
  ready: boolean,
  value: T,
  returnTo: ReturnTarget,
) {
  const baseline = useRef<T | undefined>(undefined);
  const latest = useRef(value);
  const dirty = useRef(false);
  const guard = useRef<NavigationGuardHandle>(null);
  latest.current = value;
  if (ready && baseline.current === undefined) baseline.current = value;
  const differs = (candidate: T) =>
    baseline.current !== undefined &&
    (Object.keys(candidate) as (keyof T)[]).some(
      (key) => !Object.is(candidate[key], baseline.current![key]),
    );
  dirty.current = ready && differs(value);
  const requestLeave = () => guard.current?.requestLeave();

  return {
    requestLeave,
    markSaved() {
      baseline.current = value;
      // Edits made while a write was pending still need an explicit leave decision.
      dirty.current = differs(latest.current);
    },
    linkProps: {
      ...returnTo.linkProps,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        requestLeave();
      },
    },
    dialog: (
      <NavigationGuard
        ref={guard}
        active={() => dirty.current}
        title="Discard changes?"
        message="Your changes have not been saved."
        leaveLabel="Discard changes"
        onConfirm={() => {
          baseline.current = latest.current;
          dirty.current = false;
        }}
        onExplicitLeave={returnTo.goBack}
      />
    ),
  };
}
