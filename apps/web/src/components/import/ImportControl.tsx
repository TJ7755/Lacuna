import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadImportPanel } from '../../routes/loaders';
import { prefetchRoute } from '../../routes/prefetch';
import { getLoadedRouteModule, loadRouteModule } from '../../routes/routeModule';
import { ExpandingCreateControl } from '../ui/ExpandingCreateControl';

/** Import reveals its own content in the same surface as its trigger. */
export function ImportControl({ onOpen }: { onOpen?: () => void }) {
  const [params, setParams] = useSearchParams();
  const open = params.has('import');
  const [busy, setBusy] = useState(false);
  const [panelModule, setPanelModule] = useState(() => getLoadedRouteModule(loadImportPanel));
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ImportPanel = panelModule?.default;
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
  const prefetch = () => prefetchRoute('/import');

  function changeOpen(next: boolean) {
    if (busy) return;
    setLoadError(false);
    if (next) {
      const cached = getLoadedRouteModule(loadImportPanel);
      if (cached) setPanelModule(cached);
      prefetch();
      onOpen?.();
    }
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
    <div className="relative">
      <ExpandingCreateControl
        label="Import"
        closedWidth={100}
        showIcon={false}
        open={open}
        ready={Boolean(ImportPanel)}
        onOpenChange={changeOpen}
        triggerProps={{
          disabled: busy,
          'aria-busy': pending || undefined,
          onPointerEnter: prefetch,
          onFocus: prefetch,
          ...(!open && { 'data-usage-action': 'import-opened' }),
        }}
      >
        {ImportPanel && (
          <ImportPanel
            key={params.has('join') ? 'class' : 'sources'}
            onClose={() => changeOpen(false)}
            onBusyChange={setBusy}
          />
        )}
      </ExpandingCreateControl>
      {open && loadError && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-surface-raised p-3 text-sm card-surface">
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
