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

/** A Cmd/Ctrl shortcut as this platform writes it, such as ⌘B or Ctrl+B. */
export function modifierShortcutLabel(
  key: string,
  source: RuntimePlatformSource = currentPlatformSource(),
): string {
  const mac =
    source.electronPlatform !== undefined
      ? source.electronPlatform === 'darwin'
      : source.browserPlatform?.startsWith('Mac') === true ||
        /\bMacintosh\b/i.test(source.browserUserAgent ?? '');
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}

export function quickSearchShortcutLabel(
  source: RuntimePlatformSource = currentPlatformSource(),
): '⌘K' | 'Ctrl+K' {
  return modifierShortcutLabel('K', source) as '⌘K' | 'Ctrl+K';
}
