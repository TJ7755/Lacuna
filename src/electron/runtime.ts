export function isElectronRuntime(
  electronApi: Window['electronAPI'] = window.electronAPI,
  userAgent: string = navigator.userAgent,
): boolean {
  return electronApi?.isElectron === true || /\bElectron\/\d/i.test(userAgent);
}

interface RuntimePlatformSource {
  electronPlatform?: string;
  browserPlatform?: string;
  browserUserAgent?: string;
}

function currentPlatformSource(): RuntimePlatformSource {
  return {
    electronPlatform: typeof window === 'undefined' ? undefined : window.electronAPI?.platform,
    browserPlatform: typeof navigator === 'undefined' ? undefined : navigator.platform,
    browserUserAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
  };
}

export function quickSearchShortcutLabel(
  source: RuntimePlatformSource = currentPlatformSource(),
): '⌘K' | 'Ctrl+K' {
  if (source.electronPlatform !== undefined) {
    return source.electronPlatform === 'darwin' ? '⌘K' : 'Ctrl+K';
  }

  const browserLooksLikeMac =
    source.browserPlatform?.startsWith('Mac') === true ||
    /\bMacintosh\b/i.test(source.browserUserAgent ?? '');
  return browserLooksLikeMac ? '⌘K' : 'Ctrl+K';
}
