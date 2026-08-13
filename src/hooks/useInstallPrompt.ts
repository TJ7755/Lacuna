import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * How this device can install the app.
 *
 * - `prompt`: the browser fired `beforeinstallprompt`, so we can install in one tap.
 * - `manual-ios`: iOS never fires that event; installation is a Share-sheet gesture
 *   the user must perform themselves, so the UI has to teach it rather than offer it.
 * - `unavailable`: no supported install route on this device.
 */
export type InstallMethod = 'prompt' | 'manual-ios' | 'unavailable';

/**
 * Every browser on iOS is WebKit underneath and none of them implement
 * `beforeinstallprompt`, so platform detection is the only way to tell an
 * installable iPhone from a browser that genuinely cannot install.
 *
 * iPadOS reports itself as `MacIntel` to avoid being served mobile pages, so the
 * touch-point count is what separates an iPad from a desktop Mac. `navigator.platform`
 * is deprecated but remains the only reliable signal for that distinction.
 */
function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Captures the `beforeinstallprompt` event so the app can show its own
 * "Install" UI instead of relying on the browser's default mini-infobar.
 * Returns whether the app is installable, how it can be installed, and a
 * function to trigger the prompt where one exists.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos] = useState(detectIos);

  useEffect(() => {
    // Detect if the app is already installed (standalone or display-mode: standalone).
    // iOS predates the display-mode media query and reports installation through
    // its own `navigator.standalone` flag instead.
    const mq = window.matchMedia('(display-mode: standalone)');
    const iosStandalone =
      'standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true;
    setIsInstalled(mq.matches || iosStandalone);

    const onChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener('change', onChange);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    }
  }, [deferredPrompt]);

  const method: InstallMethod = isInstallable ? 'prompt' : isIos ? 'manual-ios' : 'unavailable';

  return { isInstallable, isInstalled, method, promptInstall };
}
