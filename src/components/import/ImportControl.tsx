import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { loadImportPanel } from '../../routes/loaders';
import { prefetchRoute } from '../../routes/prefetch';
import { getLoadedRouteModule, loadRouteModule } from '../../routes/routeModule';
import { speedMultiplier, useMotionSpeed } from '../../state/motionSpeed';
import { FlowExpansionSurface } from '../ui/FlowExpansionSurface';
import { expandingActionSpring } from '../ui/motion';

const panelWidth = 'min(448px, calc(100vw - 48px))';

/** Import reveals its own content in the same surface as its trigger. */
export function ImportControl({ onOpen }: { onOpen?: () => void }) {
  const [params, setParams] = useSearchParams();
  const open = params.has('import');
  const [busy, setBusy] = useState(false);
  const [panelModule, setPanelModule] = useState(() => getLoadedRouteModule(loadImportPanel));
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ImportPanel = panelModule?.default;
  const expanded = open && Boolean(ImportPanel);
  const pending = open && !ImportPanel && !loadError;

  useEffect(() => {
    if (!open || panelModule) return;
    let cancelled = false;
    void loadRouteModule(loadImportPanel).then(
      (module) => {
        if (!cancelled) setPanelModule(module);
      },
      () => {
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, panelModule, attempt]);
  const trigger = useRef<HTMLButtonElement>(null);
  const [triggerHeight, setTriggerHeight] = useState(44);
  useLayoutEffect(() => {
    const button = trigger.current;
    if (!button) return;
    const measure = () => {
      if (button.offsetHeight > 0) setTriggerHeight(button.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  const panelId = useId();
  const [speed] = useMotionSpeed();
  const multiplier = speedMultiplier(speed);
  const transition = expandingActionSpring(multiplier);
  const prefetch = () => prefetchRoute('/import');

  function changeOpen(next: boolean) {
    if (busy) return;
    setLoadError(false);
    if (next) {
      const cached = getLoadedRouteModule(loadImportPanel);
      if (cached) setPanelModule(cached);
      prefetch();
      onOpen?.();
    } else trigger.current?.focus();
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next) updated.set('import', '1');
        else {
          updated.delete('import');
          updated.delete('join');
        }
        return updated;
      },
      { replace: true },
    );
  }

  return (
    <div className="relative z-[6] w-[100px] shrink-0" style={{ height: triggerHeight }}>
      <motion.div
        initial={false}
        animate={{
          width: expanded ? panelWidth : 100,
          height: expanded ? 'auto' : triggerHeight,
          borderRadius: expanded ? 24 : triggerHeight / 2,
        }}
        transition={transition}
        className={`absolute right-0 top-0 flow-expansion overflow-hidden bg-surface-raised ring-1 ring-inset ${expanded ? 'ring-transparent card-surface' : 'ring-line-strong'}`}
      >
        <FlowExpansionSurface
          open={expanded}
          triggerWidth={100}
          triggerHeight={triggerHeight}
          multiplier={multiplier}
        />
        {expanded && (
          <span
            aria-hidden="true"
            className="absolute left-5 top-3 font-display text-lg font-semibold text-ink"
          >
            Import
          </span>
        )}
        <motion.button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={expanded ? panelId : undefined}
          aria-busy={pending || undefined}
          disabled={busy}
          onPointerEnter={prefetch}
          onFocus={prefetch}
          onClick={() => changeOpen(!open)}
          data-press="none"
          data-flow-feedback
          data-flow-trigger
          transition={transition}
          className="absolute right-0 top-0 flex min-h-11 w-[100px] items-center justify-center rounded-full text-sm font-semibold text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink disabled:opacity-40"
        >
          {pending ? 'Loading…' : open ? 'Close' : 'Import'}
        </motion.button>
        <div inert={!expanded} aria-hidden={!expanded || undefined}>
          <AnimatePresence initial={false}>
            {expanded && ImportPanel && (
              <motion.div
                key="panel"
                id={panelId}
                // Measure final wrapping before the surrounding surface expands.
                style={{ width: panelWidth, paddingTop: triggerHeight }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 * multiplier }}
              >
                <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto overscroll-contain">
                  <ImportPanel
                    key={params.has('join') ? 'class' : 'sources'}
                    onClose={() => changeOpen(false)}
                    onBusyChange={setBusy}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      {open && loadError && (
        <div
          className="absolute right-0 w-56 rounded-xl bg-surface-raised p-3 text-sm card-surface"
          style={{ top: triggerHeight + 4 }}
        >
          <p role="alert">Could not load import.</p>
          <button
            type="button"
            className="mt-2 min-h-11 font-semibold"
            onClick={() => {
              setLoadError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
