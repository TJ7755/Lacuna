import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
  author?: string;
  homepage?: string;
  repository?: { type?: string; url?: string };
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const builderConfig = readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8');
const bunLock = readFileSync(resolve(root, 'bun.lock'), 'utf8');
const updaterSource = readFileSync(resolve(root, 'electron/updater.ts'), 'utf8');
const updaterServiceSource = readFileSync(resolve(root, 'electron/updaterService.ts'), 'utf8');
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
const prepareElectronBuild = readFileSync(
  resolve(root, 'scripts/prepare-electron-build.mjs'),
  'utf8',
);
const electronAiE2e = readFileSync(
  resolve(root, 'tests/e2e-electron/ai-companion.spec.ts'),
  'utf8',
);

function resolvedVersions(packageName: string): string[] {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    bunLock.matchAll(new RegExp(`\\["${escapedName}@([^"]+)"`, 'g')),
    ([, version]) => version,
  );
}

function isAtLeast(version: string, minimum: readonly [number, number, number]): boolean {
  const parts = version.split('.').map(Number);
  return (
    minimum.some(
      (part, index) =>
        parts[index] > part && parts.slice(0, index).every((value, i) => value === minimum[i]),
    ) || minimum.every((part, index) => parts[index] === part)
  );
}

function expectResolvedAtLeast(
  packageName: string,
  minimum: readonly [number, number, number],
): void {
  const versions = resolvedVersions(packageName);
  expect(versions.length).toBeGreaterThan(0);
  expect(versions.every((version) => isAtLeast(version, minimum))).toBe(true);
}

describe('v0.2.3 release configuration', () => {
  it('identifies the public app repository and release version', () => {
    expect(packageJson.version).toBe('0.2.3');
    expect(packageJson.author).toBe('TJ7755');
    expect(packageJson.homepage).toBe('https://github.com/TJ7755/Lacuna#readme');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/TJ7755/Lacuna.git',
    });
  });

  it('has separate, non-publishing builders for every release platform', () => {
    const scripts = packageJson.scripts ?? {};
    expect(scripts['electron:prepare']).toBe('node scripts/prepare-electron-build.mjs');
    expect(scripts['electron:build:win']).toContain('electron-builder --win --x64');
    expect(scripts['electron:build:linux']).toContain('electron-builder --linux --x64');
    expect(scripts['electron:build:mac']).toContain('electron-builder --mac --arm64');
    for (const name of ['electron:build:win', 'electron:build:linux', 'electron:build:mac']) {
      expect(scripts[name]).toContain('electron:prepare');
      expect(scripts[name]).toContain('--publish never');
    }
  });

  it('uses the maintained Electron Builder 26 toolchain without vulnerable transitive versions', () => {
    expect(packageJson.devDependencies?.['electron-builder']).toBe('^26.15.7');
    expect(resolvedVersions('electron-builder')).toEqual(['26.15.7']);
    expectResolvedAtLeast('app-builder-lib', [26, 15, 0]);
    expectResolvedAtLeast('builder-util-runtime', [9, 7, 0]);
    expectResolvedAtLeast('tar', [7, 5, 21]);
    expect(bunLock).not.toContain('["app-builder-bin@');
  });

  it('runs Electron build tools without platform shell shims', () => {
    expect(prepareElectronBuild).toContain('process.execPath');
    expect(prepareElectronBuild).toContain("'node_modules/typescript/bin/tsc'");
    expect(prepareElectronBuild).not.toContain('tsc.cmd');
    expect(prepareElectronBuild).not.toContain('shell: true');
  });

  it('lets Electron 42 lazily install its platform runtime for desktop tests', () => {
    expect(electronAiE2e).toContain("createRequire(import.meta.url)");
    expect(electronAiE2e).toContain("require('electron')");
    expect(electronAiE2e).not.toContain("node_modules/electron/dist");
  });

  it('builds the supported Windows and Linux artefacts', () => {
    expect(builderConfig).toMatch(/target:\s*[\s\S]*?target:\s*nsis[\s\S]*?target:\s*portable/);
    expect(builderConfig).toMatch(
      /artifactName:\s*['"]\$\{productName\}-Setup-\$\{version\}\.\$\{ext\}['"]/,
    );
    expect(builderConfig).toMatch(
      /artifactName:\s*['"]\$\{productName\}-Portable-\$\{version\}\.\$\{ext\}['"]/,
    );
    expect(builderConfig).toMatch(/linux:\s*[\s\S]*?target:\s*AppImage[\s\S]*?target:\s*deb/);
    expect(builderConfig).toMatch(/maintainer:\s*[^\s#]+/);
    expect(builderConfig).toMatch(/arch:\s*[\s\S]*?- x64/);
    expect(builderConfig).toMatch(/linux:[\s\S]*?icon: electron\/assets\/icon\.png/);
    expect(builderConfig).toMatch(/mac:[\s\S]*?icon: electron\/assets\/icon\.png/);
  });

  it('builds the Windows icon from the generated desktop artwork', () => {
    const windowsConfig = builderConfig.match(/^win:\n([\s\S]*?)^nsis:/m)?.[1] ?? '';
    expect(windowsConfig).toContain('icon: electron/assets/icon.png');
    expect(existsSync(resolve(root, 'electron/assets/icon.ico'))).toBe(false);
  });

  it('shows immediate branded feedback while the Windows portable build extracts', () => {
    expect(builderConfig).toMatch(
      /portable:\s*[\s\S]*?splashImage:\s*electron\/assets\/portable-splash\.bmp/,
    );
    const splashPath = resolve(root, 'electron/assets/portable-splash.bmp');
    expect(existsSync(splashPath)).toBe(true);

    const splash = readFileSync(splashPath);
    expect(splash.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(splash.readInt32LE(18)).toBe(560);
    expect(splash.readInt32LE(22)).toBe(260);
    expect(splash.readUInt16LE(28)).toBe(24);
  });

  it('keeps updater distribution rules explicit', () => {
    expect(updaterSource).toContain('environment: process.env');
    expect(updaterServiceSource).toContain('options.environment.PORTABLE_EXECUTABLE_FILE');
    expect(updaterServiceSource).toContain('options.environment.APPIMAGE');
    expect(updaterServiceSource).toMatch(
      /options\.platform === ['"]linux['"][\s\S]*?!options\.environment\.APPIMAGE/,
    );
    expect(updaterServiceSource).toMatch(
      /options\.platform === ['"]win32['"][\s\S]*?PORTABLE_EXECUTABLE_FILE/,
    );
    expect(updaterServiceSource).toContain('options.updater.allowPrerelease = true');
    expect(updaterServiceSource).toContain('options.updater.checkForUpdates()');
    expect(updaterServiceSource).toContain('options.updater.autoInstallOnAppQuit = false');
  });

  it('gates one draft publisher on complete release verification', () => {
    for (const command of [
      'bun run typecheck',
      'bun run lint',
      'bun run test:ci:unit',
      'bun run test:coverage',
      'bun run build:assets',
      'bun run release:scenario',
      'bun run test:e2e:web',
      'bun run perf:check',
    ]) {
      expect(releaseWorkflow).toContain(command);
    }
    expect(releaseWorkflow).toContain('needs: verify');
    expect(releaseWorkflow).toMatch(
      /verify:[\s\S]*?- run: bun install --frozen-lockfile\s+working-directory: relay[\s\S]*?bun run test:e2e:web\s*\n\s*build-win:/,
    );
    expect(releaseWorkflow).toContain('windows-latest');
    expect(releaseWorkflow).toContain('ubuntu-latest');
    expect(releaseWorkflow).toContain('actions/upload-artifact@v7');
    expect(releaseWorkflow).toContain('release/*.exe');
    expect(releaseWorkflow).toContain('release/*.exe.blockmap');
    expect(releaseWorkflow).toContain('release/latest.yml');
    expect(releaseWorkflow).toContain('release/*.AppImage');
    expect(releaseWorkflow).toContain('release/*.AppImage.blockmap');
    expect(releaseWorkflow).toContain('release/*.deb');
    expect(releaseWorkflow).toContain('release/latest-linux.yml');
    expect(releaseWorkflow).not.toContain('path: release/**');
    expect(releaseWorkflow).not.toContain('path: release/*');
    expect(releaseWorkflow).toContain('--draft');
    expect(releaseWorkflow).toContain('--prerelease');
    expect(releaseWorkflow).toContain('--title "Lacuna ${GITHUB_REF_NAME#v} Beta"');
    expect(releaseWorkflow).toContain('! -name SHA256SUMS.txt');
    expect(releaseWorkflow).toContain('gh release delete-asset');
    expect(releaseWorkflow).toContain("--jq '.assets[].name'");
    expect(releaseWorkflow).not.toContain('--publish always');
    expect(releaseWorkflow).toMatch(/publish-draft:[\s\S]*?needs:\s*\[build-win, build-linux\]/);
  });

  it('uses Node 24 action majors throughout CI and release workflows', () => {
    for (const workflow of [ciWorkflow, releaseWorkflow]) {
      expect(workflow).toContain('actions/checkout@v7');
      expect(workflow).not.toMatch(/actions\/checkout@v[1-6](?:\D|$)/);
      expect(workflow).not.toMatch(/actions\/(?:upload|download)-artifact@v[1-6](?:\D|$)/);
    }
    expect(releaseWorkflow).toContain('actions/upload-artifact@v7');
    expect(releaseWorkflow).toContain('actions/download-artifact@v8');
  });
});
