export function isElectronRuntime(
  electronApi: Window['electronAPI'] = window.electronAPI,
  userAgent: string = navigator.userAgent,
): boolean {
  return electronApi?.isElectron === true || /\bElectron\/\d/i.test(userAgent);
}
