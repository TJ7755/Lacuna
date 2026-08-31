import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
  author?: string;
  homepage?: string;
  repository?: { type?: string; url?: string };
  scripts?: Record<string, string>;
};
const builderConfig = readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8');
const updaterSource = readFileSync(resolve(root, 'electron/updater.ts'), 'utf8');
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');

describe('v0.2.0 release configuration', () => {
  it('identifies the public app repository and release version', () => {
    expect(packageJson.version).toBe('0.2.0');
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

  it('builds the supported Windows and Linux artefacts', () => {
    expect(builderConfig).toMatch(/target:\s*[\s\S]*?target:\s*nsis[\s\S]*?target:\s*portable/);
    expect(builderConfig).toMatch(/linux:\s*[\s\S]*?target:\s*AppImage[\s\S]*?target:\s*deb/);
    expect(builderConfig).toMatch(/maintainer:\s*[^\s#]+/);
    expect(builderConfig).toMatch(/arch:\s*[\s\S]*?- x64/);
    expect(builderConfig).toMatch(/linux:[\s\S]*?icon: electron\/assets\/icon\.png/);
    expect(builderConfig).toMatch(/mac:[\s\S]*?icon: electron\/assets\/icon\.png/);
  });

  it('keeps updater distribution rules explicit', () => {
    expect(updaterSource).toContain('process.env.PORTABLE_EXECUTABLE_FILE');
    expect(updaterSource).toContain('process.env.APPIMAGE');
    expect(updaterSource).toMatch(/process\.platform === ['"]linux['"][\s\S]*?process\.env\.APPIMAGE/);
    expect(updaterSource).toMatch(/process\.platform === ['"]win32['"][\s\S]*?PORTABLE_EXECUTABLE_FILE/);
    expect(updaterSource).toContain('autoUpdater.allowPrerelease = true');
    expect(updaterSource).toContain('autoUpdater.checkForUpdates()');
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
    expect(releaseWorkflow).toContain('actions/upload-artifact@v4');
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
});
