const failures = new WeakSet<object>();

export function claimRouteImportFailure(cause: unknown): void {
  if (typeof cause === 'object' && cause !== null) failures.add(cause);
}

export function isRouteImportFailure(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && failures.has(cause);
}
