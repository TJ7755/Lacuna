import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';

/** Keep camera ownership tied to the mounted scanning view, including pending startup. */
export function useCourseQrScanner(onScan: (text: string) => Promise<void>) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerId = `course-qr-${useId().replace(/:/g, '')}`;
  const decoded = useEffectEvent(onScan);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let received = false;
    let scanner: Html5Qrcode | undefined;
    let started = false;
    let released = false;
    async function release() {
      if (!scanner || !started || released) return;
      released = true;
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // Camera cleanup can race a device disconnect.
      }
    }
    void (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled || !scannerRef.current) return;
        scanner = new Html5Qrcode(scannerRef.current.id);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (text) => {
            if (cancelled || received) return;
            received = true;
            setScanning(false);
            void decoded(text);
          },
          () => {
            // No QR code in this frame; continue scanning.
          },
        );
        started = true;
        if (cancelled || received) await release();
      } catch (error) {
        if (!cancelled) {
          setScanError(error instanceof Error ? error.message : 'Could not start camera scanner.');
          setScanning(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      void release();
    };
  }, [scanning]);

  function startScanning() {
    setScanError(null);
    setScanning(true);
  }
  function stopScanning() {
    setScanning(false);
    setScanError(null);
  }
  return { scanning, scanError, scannerRef, scannerId, startScanning, stopScanning };
}
