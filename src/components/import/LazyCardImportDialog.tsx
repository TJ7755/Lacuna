import { lazy } from 'react';
import { PageLoadingBoundary } from '../ui/PageLoadingBoundary';
import type { CardImportDialogProps } from './CardImportDialog';

const Dialog = lazy(() =>
  import('./CardImportDialog').then((module) => ({ default: module.CardImportDialog })),
);

/** Keep file parsers and card previews off the dashboard's initial loading path. */
export function LazyCardImportDialog(props: CardImportDialogProps) {
  return (
    <PageLoadingBoundary>
      <Dialog {...props} />
    </PageLoadingBoundary>
  );
}
