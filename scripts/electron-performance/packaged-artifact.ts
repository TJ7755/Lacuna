import path from 'node:path';

export function appAsarPathForExecutable(
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  return platform === 'darwin'
    ? platformPath.resolve(platformPath.dirname(executablePath), '..', 'Resources', 'app.asar')
    : platformPath.join(platformPath.dirname(executablePath), 'resources', 'app.asar');
}
