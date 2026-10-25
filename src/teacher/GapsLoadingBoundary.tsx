import { useEffect, useState, type ReactNode } from 'react';
import { useLoadingVisibility } from '../hooks/useLoadingVisibility';

function LoadingPlaceholder({ children }: { children: ReactNode }) {
  const [placeholder] = useState(children);
  return placeholder;
}

/** Keep the teacher handoff independent of the learner animation runtime. */
export function GapsLoadingBoundary({
  pending,
  fallback,
  children,
}: {
  pending: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const visible = useLoadingVisibility(pending, 200, 0);
  const [retained, setRetained] = useState(false);
  const showing = pending && (visible || retained);

  useEffect(() => {
    if (showing) {
      setRetained(true);
      return;
    }
    if (!retained) return;
    // Also release the surface when a background tab does not dispatch transitionend.
    const timer = window.setTimeout(() => setRetained(false), 460);
    return () => window.clearTimeout(timer);
  }, [showing, retained]);

  return (
    <div className="relative">
      {(showing || retained) && (
        <div
          role={showing ? 'status' : undefined}
          aria-label={showing ? 'Loading class' : undefined}
          aria-hidden={!showing || undefined}
          inert={!showing}
          className="gaps-loading-placeholder"
          data-showing={showing || undefined}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && !showing) setRetained(false);
          }}
        >
          <LoadingPlaceholder>{fallback}</LoadingPlaceholder>
        </div>
      )}
      <div className="gaps-loading-content" data-loading={showing || undefined} inert={showing}>
        {children}
      </div>
    </div>
  );
}
