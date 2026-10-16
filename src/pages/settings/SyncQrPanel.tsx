import { lazy, Suspense, type Ref } from 'react';
import { Button } from '../../components/ui/Button';
import { CloseIcon } from '../../components/ui/icons';
import { SettingsSubsectionHeading } from './SettingsSectionHeading';

export const loadQrCode = () => import('react-qr-code');
const QRCode = lazy(loadQrCode);

/** The pairing QR for an unlocked device; hides itself when focus or the window leaves. */
export function SyncQrPanel({
  panelRef,
  qrValue,
  onHide,
  onDismiss,
  onCopy,
}: {
  panelRef: Ref<HTMLDivElement>;
  qrValue: string;
  onHide: () => void;
  onDismiss: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Sync pairing QR code"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) onHide();
      }}
      className="rounded-2xl bg-paper p-5 outline-none"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <SettingsSubsectionHeading className="font-display text-lg font-semibold tracking-tight">
            Pair another device
          </SettingsSubsectionHeading>
          <p className="text-xs text-ink-soft">
            Show this only while the other device is ready to scan.
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Hide pairing QR" onClick={onDismiss}>
          <CloseIcon width={16} height={16} />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-white p-4">
          <Suspense fallback={<div className="h-64 w-64" aria-hidden="true" />}>
            <QRCode value={qrValue} size={256} level="L" bgColor="#ffffff" fgColor="#000000" />
          </Suspense>
        </div>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          Copy pairing link
        </Button>
        <p className="max-w-sm text-center text-xs text-ink-faint">
          This QR contains the channel access key. It is not a backup and should not be shared
          publicly. Copy the link for devices without a camera.
        </p>
      </div>
    </div>
  );
}
