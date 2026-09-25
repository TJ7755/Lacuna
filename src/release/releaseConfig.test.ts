import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { blockScalarValues, namedAction, workflowJob, workflowStep } from './releaseWorkflowRead';

const root = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
  author?: string;
  homepage?: string;
  repository?: { type?: string; url?: string };
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const relayPackageJson = JSON.parse(readFileSync(resolve(root, 'relay/package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};
const handwritingPackageJson = JSON.parse(
  readFileSync(resolve(root, 'tooling/handwriting-maths/package.json'), 'utf8'),
) as { devDependencies?: Record<string, string> };
const aiMcpPackageJson = JSON.parse(
  readFileSync(resolve(root, 'tooling/lacuna-ai-mcp/package.json'), 'utf8'),
) as { devDependencies?: Record<string, string> };
const builderConfig = readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const builder = parse(builderConfig) as {
  win: { target: { target: string; arch: string[] }[]; icon: string };
  linux: { target: { target: string; arch: string[] }[]; maintainer: string; icon: string };
  mac: { target: string[]; icon: string };
  nsis: { artifactName: string; include: string };
  portable: { artifactName: string; splashImage: string };
};
const windowsInstallerInclude = readFileSync(
  resolve(root, 'electron/windows-installer.nsh'),
  'utf8',
);
const bunLock = readFileSync(resolve(root, 'bun.lock'), 'utf8');
const relayBunLock = readFileSync(resolve(root, 'relay/bun.lock'), 'utf8');
const handwritingBunLock = readFileSync(
  resolve(root, 'tooling/handwriting-maths/bun.lock'),
  'utf8',
);
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const releaseWorkflow = readFileSync(
  resolve(root, '.github/workflows/release.yml'),
  'utf8',
).replace(/\r\n/g, '\n');
const securityWorkflow = readFileSync(
  resolve(root, '.github/workflows/security.yml'),
  'utf8',
).replace(/\r\n/g, '\n');

function resolvedVersionsFrom(lockfile: string, packageName: string): string[] {
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    lockfile.matchAll(new RegExp(`\\["${escapedName}@([^"]+)"`, 'g')),
    ([, version]) => version,
  );
}

function resolvedVersions(packageName: string): string[] {
  return resolvedVersionsFrom(bunLock, packageName);
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

function expectResolvedAtLeastFrom(
  lockfile: string,
  packageName: string,
  minimum: readonly [number, number, number],
): void {
  const versions = resolvedVersionsFrom(lockfile, packageName);
  expect(versions.length).toBeGreaterThan(0);
  expect(versions.every((version) => isAtLeast(version, minimum))).toBe(true);
}

function expectDeclaredAtLeast(
  declared: string | undefined,
  minimum: readonly [number, number, number],
): void {
  expect(declared).toMatch(/^\^?\d+\.\d+\.\d+$/);
  expect(isAtLeast(declared!.replace(/^\^/, ''), minimum)).toBe(true);
}

describe('release configuration', () => {
  it('identifies the public app repository and release version', () => {
    expect(packageJson.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
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
    expect(scripts['perf:check:electron-package']).toBe(
      'bun scripts/electron-package-audit.ts --asar release/win-unpacked/resources/app.asar --check',
    );
    for (const name of ['electron:build:win', 'electron:build:linux', 'electron:build:mac']) {
      expect(scripts[name]).toContain('electron:prepare');
      expect(scripts[name]).toContain('--publish never');
    }
  });

  it('uses a safe Electron Builder toolchain without vulnerable transitive versions', () => {
    expectDeclaredAtLeast(packageJson.devDependencies?.['electron-builder'], [26, 16, 1]);
    expectResolvedAtLeast('electron-builder', [26, 16, 1]);
    expectResolvedAtLeast('app-builder-lib', [26, 15, 0]);
    expectResolvedAtLeast('builder-util-runtime', [9, 7, 0]);
    expectResolvedAtLeast('tar', [7, 5, 21]);
    expect(bunLock).not.toContain('["app-builder-bin@');
  });

  it('keeps every test workspace on safe Vitest and Vite versions', () => {
    for (const manifest of [
      packageJson,
      relayPackageJson,
      handwritingPackageJson,
      aiMcpPackageJson,
    ]) {
      expectDeclaredAtLeast(manifest.devDependencies?.vitest, [5, 0, 1]);
    }
    expect(packageJson.devDependencies?.['@vitest/coverage-v8']).toBe(
      packageJson.devDependencies?.vitest,
    );
    expectDeclaredAtLeast(packageJson.devDependencies?.vite, [8, 3, 0]);
    expectDeclaredAtLeast(relayPackageJson.devDependencies?.vite, [8, 3, 0]);
    expect(relayPackageJson.overrides?.vite).toBeUndefined();

    for (const lockfile of [bunLock, relayBunLock, handwritingBunLock]) {
      expectResolvedAtLeastFrom(lockfile, 'vitest', [5, 0, 1]);
      expectResolvedAtLeastFrom(lockfile, 'vite', [8, 3, 0]);
    }
    expectResolvedAtLeast('@vitest/coverage-v8', [5, 0, 1]);
    expect(existsSync(resolve(root, 'tooling/lacuna-ai-mcp/bun.lock'))).toBe(false);
  });

  it('builds the supported Windows, Linux and macOS artefacts', () => {
    expect(builder.win.target).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'nsis', arch: expect.arrayContaining(['x64']) }),
        expect.objectContaining({ target: 'portable', arch: expect.arrayContaining(['x64']) }),
      ]),
    );
    expect(builder.linux.target).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'AppImage', arch: expect.arrayContaining(['x64']) }),
        expect.objectContaining({ target: 'deb', arch: expect.arrayContaining(['x64']) }),
      ]),
    );
    expect(builder.mac.target).toEqual(expect.arrayContaining(['dmg', 'zip']));
    expect(builder.nsis.artifactName).toBe('${productName}-Setup-${version}.${ext}');
    expect(builder.portable.artifactName).toBe('${productName}-Portable-${version}.${ext}');
    expect(builder.linux.maintainer).toMatch(/\S/);
    expect(builder.linux.icon).toBe('electron/assets/icon.png');
    expect(builder.mac.icon).toBe('electron/assets/icon.png');
  });

  it('prevents registered companions from racing a Windows upgrade', () => {
    expect(builder.nsis.include).toBe('electron/windows-installer.nsh');
    expect(windowsInstallerInclude).toContain('!macro customCheckAppRunning');
    expect(windowsInstallerInclude).toContain('GetCurrentProcessId');
    expect(windowsInstallerInclude).toContain('installation-in-progress');
    expect(windowsInstallerInclude).toContain('!insertmacro IS_POWERSHELL_AVAILABLE');
    expect(windowsInstallerInclude).toContain('!insertmacro _CHECK_APP_RUNNING');
    expect(windowsInstallerInclude.indexOf('!insertmacro IS_POWERSHELL_AVAILABLE')).toBeLessThan(
      windowsInstallerInclude.indexOf('!insertmacro _CHECK_APP_RUNNING'),
    );
    expect(windowsInstallerInclude).toContain('!macro customInstall');
    expect(windowsInstallerInclude).toContain('Delete');
  });

  it('builds the Windows icon from the generated desktop artwork', () => {
    expect(builder.win.icon).toBe('electron/assets/icon.png');
    expect(existsSync(resolve(root, 'electron/assets/icon.ico'))).toBe(false);
  });

  it('shows immediate branded feedback while the Windows portable build extracts', () => {
    expect(builder.portable.splashImage).toBe('electron/assets/portable-splash.bmp');
    const splashPath = resolve(root, 'electron/assets/portable-splash.bmp');
    expect(existsSync(splashPath)).toBe(true);

    const splash = readFileSync(splashPath);
    expect(splash.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(splash.readInt32LE(18)).toBe(560);
    expect(splash.readInt32LE(22)).toBe(260);
    expect(splash.readUInt16LE(28)).toBe(24);
  });

  it('gates one draft publisher on exact-commit CI without repeating its suites', () => {
    const verifyJob = workflowJob(releaseWorkflow, 'verify');
    for (const command of [
      'bun run typecheck',
      'bun run lint',
      'bun run test:ci:unit',
      'bun run test:coverage',
      'bun run test:coverage:recovery',
      'bun run release:scenario',
      'bun run test:e2e:web',
      'bun run build:assets',
      'bun run perf:check',
    ]) {
      expect(ciWorkflow).toContain(command);
      expect(verifyJob).not.toContain(command);
    }
    expect(verifyJob).toContain('fetch-depth: 0');
    expect(verifyJob).toContain('tag_commit="$(git rev-parse --verify "${GITHUB_REF}^{commit}")"');
    expect(verifyJob).toContain('if [[ "$tag_commit" != "$GITHUB_SHA" ]]');
    const exactCommitChecks = workflowStep(verifyJob, 'Require successful CI for this commit');
    expect(exactCommitChecks).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(exactCommitChecks).toContain('required_workflows=(CI Security)');
    expect(exactCommitChecks).toContain('head_sha=${GITHUB_SHA}');
    expect(exactCommitChecks).toContain('.event == "push"');
    expect(exactCommitChecks).toContain('.head_branch == "master"');
    expect(exactCommitChecks).toContain('.head_branch == "main"');
    expect(exactCommitChecks).toContain('.conclusion == "success"');
    expect(verifyJob).not.toContain('bun install');
    for (const workspace of ['relay', 'tooling/lacuna-ai-mcp']) {
      expect(ciWorkflow).toContain(`working-directory: ${workspace}`);
      expect(verifyJob).not.toContain(`working-directory: ${workspace}`);
    }

    const githubPlatforms = [
      {
        job: 'build-win',
        runner: 'windows-latest',
        build: 'bun run electron:build:win',
        label: 'Windows',
        artefact: 'lacuna-win-x64',
        paths: [
          'release/Lacuna-Setup-*.exe',
          'release/Lacuna-Setup-*.exe.blockmap',
          'release/Lacuna-Portable-*.exe',
          'release/latest.yml',
        ],
      },
      {
        job: 'build-linux',
        runner: 'ubuntu-latest',
        build: 'bun run electron:build:linux',
        label: 'Linux',
        artefact: 'lacuna-linux-x64',
        paths: ['release/*.AppImage', 'release/*.deb', 'release/latest-linux.yml'],
      },
    ] as const;

    for (const platform of githubPlatforms) {
      const job = workflowJob(releaseWorkflow, platform.job);
      const allowlistCheck = workflowStep(job, `Verify ${platform.label} artefact allowlist`);
      const attest = workflowStep(job, `Attest ${platform.label} artefacts`);
      const upload = workflowStep(job, `Upload ${platform.label} artefacts`);

      expect(job).toContain('needs: verify');
      expect(job).toContain(`runs-on: ${platform.runner}`);
      expect(job).toContain(platform.build);
      expect(job).toContain(
        'permissions:\n      artifact-metadata: write\n      attestations: write\n' +
          '      contents: read\n      id-token: write',
      );
      expect(job).not.toContain('contents: write');
      for (const path of platform.paths) expect(allowlistCheck).toContain(path);
      if (platform.job === 'build-win') {
        expect(allowlistCheck).toContain('shell: pwsh');
        expect(allowlistCheck).toContain('Get-ChildItem -Path $pattern -File');
        expect(job).toContain('bun run perf:check:electron-package');
        expect(job.indexOf(platform.build)).toBeLessThan(
          job.indexOf('bun run perf:check:electron-package'),
        );
        expect(job.indexOf('bun run perf:check:electron-package')).toBeLessThan(
          job.indexOf(allowlistCheck),
        );
      } else {
        expect(allowlistCheck).toContain('shell: bash');
        expect(allowlistCheck).toContain('compgen -G "$pattern"');
      }
    expect(securityWorkflow).toContain('github/codeql-action/init@');
    expect(securityWorkflow).toContain('github/codeql-action/analyze@');
