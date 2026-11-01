import path from 'node:path';

export type AppAssetPathResult = { ok: true; path: string } | { ok: false; status: 400 | 403 };

/** Resolve a trusted app:// asset URL without allowing its authority to become a file path. */
export function resolveAppAssetPath(requestUrl: string, distPath: string): AppAssetPathResult {
  let parsed: URL;
  let decodedPath: string;
  try {
    parsed = new URL(requestUrl);
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return { ok: false, status: 400 };
  }

  if (
    parsed.protocol !== 'app:' ||
    parsed.hostname !== '.' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== ''
  ) {
    return { ok: false, status: 403 };
  }

  const resolvedPath = path.resolve(distPath, `.${decodedPath}`);
  const relativePath = path.relative(distPath, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, path: resolvedPath };
}
