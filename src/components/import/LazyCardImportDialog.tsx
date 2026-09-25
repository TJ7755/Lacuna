import { lazy, Suspense } from 'react';
import { DelayedFallback } from '../ui/DelayedFallback';
import type { CardImportDialogProps } from './CardImportDialog';

const Dialog = lazy(() =>
  import('./CardImportDialog').then((module) => ({ default: module.CardImportDialog })),
);

/** Keep file parsers and card previews off the dashboard's initial loading path. */
export function LazyCardImportDialog(props: CardImportDialogProps) {
  return (
    <Suspense
      fallback={
        <DelayedFallback>
          <p role="status">Loading importer…</p>
        </DelayedFallback>
      }
    >
      <Dialog {...props} />
    </Suspense>
  );
}
