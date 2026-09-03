export type PackageAssetKind = 'source-map' | 'build-only' | 'runtime';

const SOURCE_MAP = /\.map$/i;
const BUILD_ONLY =
  /(?:^|\/)(?:__tests__|coverage|test-results|storybook)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$|\.(?:d\.(?:ts|cts|mts)|tsbuildinfo|ts|tsx|jsx|md|markdown)$/i;

export function packageAssetKind(filePath: string): PackageAssetKind {
  if (SOURCE_MAP.test(filePath)) return 'source-map';
  if (BUILD_ONLY.test(filePath)) return 'build-only';
  return 'runtime';
}

export function selectAsarCandidate(candidates: string[]): string {
  if (candidates.length === 0) {
    throw new Error('No release app.asar found. Build Electron first or pass --asar <path>.');
  }
  if (candidates.length > 1) {
    throw new Error('Multiple release app.asar files found. Pass the intended --asar <path>.');
  }
  return candidates[0];
}

export function isWindowsAsarPath(filePath: string): boolean {
  return /(?:^|[\\/])win-unpacked[\\/]resources[\\/]app\.asar$/i.test(filePath);
}
