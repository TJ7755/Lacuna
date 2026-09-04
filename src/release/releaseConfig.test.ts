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
const builderConfig = readFileSync(resolve(root, 'electron/electron-builder.yml'), 'utf8');
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
const updaterSource = readFileSync(resolve(root, 'electron/updater.ts'), 'utf8');
const updaterServiceSource = readFileSync(resolve(root, 'electron/updaterService.ts'), 'utf8');
const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const releaseWorkflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
const securityWorkflow = readFileSync(resolve(root, '.github/workflows/security.yml'), 'utf8');
const prepareElectronBuild = readFileSync(
  resolve(root, 'scripts/prepare-electron-build.mjs'),
  'utf8',
);
const electronAiE2e = readFileSync(
  resolve(root, 'tests/e2e-electron/ai-companion.spec.ts'),
  'utf8',
);

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

function workflowJob(workflow: string, name: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) throw new Error(`Workflow job ${name} does not exist`);

  const nextJob = lines.findIndex(
    (line, index) => index > start && /^ {2}[a-z0-9-]+:$/.test(line),
  );
  return lines.slice(start, nextJob === -1 ? lines.length : nextJob).join('\n');
}

function workflowStep(job: string, name: string): string {
  const lines = job.split('\n');
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  if (start === -1) throw new Error(`Workflow step ${name} does not exist`);

  const nextStep = lines.findIndex(
    (line, index) => index > start && line.startsWith('      - '),
  );
  return lines.slice(start, nextStep === -1 ? lines.length : nextStep).join('\n');
}

function blockScalarValues(block: string, key: string): string[] {
  const lines = block.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}: |`);
  if (start === -1) throw new Error(`Block scalar ${key} does not exist`);

  const indentation = lines[start].length - lines[start].trimStart().length;
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const value = line.trim();
    const valueIndentation = line.length - line.trimStart().length;
    if (!value || valueIndentation <= indentation) break;
    values.push(value);
  }
  return values;
}

describe('v0.2.5 release configuration', () => {
  it('identifies the public app repository and release version', () => {
    expect(packageJson.version).toBe('0.2.5');
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

  it('uses the maintained Electron Builder 26 toolchain without vulnerable transitive versions', () => {
    expect(packageJson.devDependencies?.['electron-builder']).toBe('^26.15.7');
    expect(resolvedVersions('electron-builder')).toEqual(['26.15.7']);
    expectResolvedAtLeast('app-builder-lib', [26, 15, 0]);
    expectResolvedAtLeast('builder-util-runtime', [9, 7, 0]);
    expectResolvedAtLeast('tar', [7, 5, 21]);
    expect(bunLock).not.toContain('["app-builder-bin@');
  });

  it('keeps every test workspace on the patched Vitest 3 toolchain', () => {
    expect(packageJson.devDependencies?.vitest).toBe('3.2.7');
    expect(packageJson.devDependencies?.['@vitest/coverage-v8']).toBe('3.2.7');
    expect(relayPackageJson.devDependencies?.vitest).toBe('3.2.7');
    expect(relayPackageJson.devDependencies?.vite).toBe('^6.4.3');
    expect(relayPackageJson.overrides?.vite).toBe('6.4.3');
    expect(handwritingPackageJson.devDependencies?.vitest).toBe('3.2.7');
    expect(aiMcpPackageJson.devDependencies?.vitest).toBe('3.2.7');

    expect(resolvedVersions('vitest')).toEqual(['3.2.7']);
    expect(resolvedVersions('@vitest/coverage-v8')).toEqual(['3.2.7']);
    expect(resolvedVersions('vite')).toEqual(['6.4.3']);
    expect(resolvedVersionsFrom(relayBunLock, 'vitest')).toEqual(['3.2.7']);
    expect(resolvedVersionsFrom(relayBunLock, 'vite')).toEqual(['6.4.3']);
    expect(resolvedVersionsFrom(handwritingBunLock, 'vitest')).toEqual(['3.2.7']);
    expect(resolvedVersionsFrom(handwritingBunLock, 'vite')).toEqual(['6.4.3']);
    expect(existsSync(resolve(root, 'tooling/lacuna-ai-mcp/bun.lock'))).toBe(false);
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

  it('builds the supported Windows, Linux and macOS artefacts', () => {
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

  it('prevents registered companions from racing a Windows upgrade', () => {
    expect(builderConfig).toMatch(/nsis:\s*[\s\S]*?include:\s*electron\/windows-installer\.nsh/);
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
    const verifyJob = workflowJob(releaseWorkflow, 'verify');
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
      expect(verifyJob).toContain(command);
    }
    expect(verifyJob).toContain('fetch-depth: 0');
    expect(verifyJob).toContain(
      'tag_commit="$(git rev-parse --verify "${GITHUB_REF}^{commit}")"',
    );
    expect(verifyJob).toContain('if [[ "$tag_commit" != "$GITHUB_SHA" ]]');
    const exactCommitChecks = workflowStep(verifyJob, 'Require successful CI for this commit');
    expect(exactCommitChecks).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(exactCommitChecks).toContain('required_workflows=(CI Security)');
    expect(exactCommitChecks).toContain('head_sha=${GITHUB_SHA}');
    expect(exactCommitChecks).toContain('.event == "push"');
    expect(exactCommitChecks).toContain('.head_branch == "master"');
    expect(exactCommitChecks).toContain('.head_branch == "main"');
    expect(exactCommitChecks).toContain('.conclusion == "success"');
    expect(verifyJob.match(/- run: bun install --frozen-lockfile/g)).toHaveLength(2);

    const relayInstall =
      '- run: bun install --frozen-lockfile\n        working-directory: relay';
    const relayVerification = workflowStep(verifyJob, 'Verify relay workspace');
    expect(relayVerification).toContain('working-directory: relay');
    expect(blockScalarValues(relayVerification, 'run')).toEqual([
      'bun run typecheck',
      'bun run lint',
      'bun run test',
    ]);
    expect(verifyJob.indexOf(relayInstall)).toBeLessThan(verifyJob.indexOf(relayVerification));

    const aiMcpVerification = workflowStep(verifyJob, 'Verify standalone AI MCP');
    expect(aiMcpVerification).toContain('working-directory: tooling/lacuna-ai-mcp');
    expect(blockScalarValues(aiMcpVerification, 'run')).toEqual([
      'bun run typecheck',
      'bun run lint',
      'bun run test',
      'bun run build',
    ]);
    expect(verifyJob.indexOf(relayInstall)).toBeLessThan(verifyJob.indexOf(aiMcpVerification));
    expect(verifyJob).not.toMatch(
      /bun install --frozen-lockfile\n\s+working-directory: tooling\/lacuna-ai-mcp/,
    );

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
        paths: [
          'release/*.AppImage',
          'release/*.deb',
          'release/latest-linux.yml',
        ],
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
      expect(attest).toContain('uses: actions/attest@v4');
      expect(blockScalarValues(attest, 'subject-path')).toEqual(platform.paths);
      expect(upload).toContain('uses: actions/upload-artifact@v7');
      expect(upload).toContain(`name: ${platform.artefact}`);
      expect(blockScalarValues(upload, 'path')).toEqual(platform.paths);
      expect(job.indexOf(allowlistCheck)).toBeLessThan(job.indexOf(attest));
      expect(job.indexOf(attest)).toBeLessThan(job.indexOf(upload));
    }

    const windowsJob = workflowJob(releaseWorkflow, 'build-win');
    expect(windowsJob).toContain('bun run test:e2e:electron-ai');
    expect(releaseWorkflow).not.toContain('  build-mac:');
    expect(releaseWorkflow).not.toContain('runs-on: macos-15');
    expect(releaseWorkflow).not.toContain('lacuna-macos-arm64');
    expect(releaseWorkflow).not.toContain('release/*.AppImage.blockmap');

    const publisher = workflowJob(releaseWorkflow, 'publish-draft');
    expect(publisher).toContain('needs: [build-win, build-linux]');
    expect(publisher).toContain(
      'permissions:\n      artifact-metadata: write\n      attestations: write\n' +
        '      contents: write\n      id-token: write',
    );
    for (const artefact of githubPlatforms.map(({ artefact }) => artefact)) {
      const download = workflowStep(publisher, `Download ${artefact}`);
      expect(download).toContain('uses: actions/download-artifact@v8');
      expect(download).toContain(`name: ${artefact}`);
      expect(download).toContain('path: release-assets');
    }

    const checksumAttestation = workflowStep(publisher, 'Attest GitHub checksum manifest');
    expect(checksumAttestation).toContain('uses: actions/attest@v4');
    expect(checksumAttestation).toContain('subject-path: release-assets/SHA256SUMS-github.txt');
    expect(publisher.indexOf('name: Create checksums')).toBeLessThan(
      publisher.indexOf(checksumAttestation),
    );
    expect(publisher.indexOf(checksumAttestation)).toBeLessThan(
      publisher.indexOf('name: Upload artefacts to draft release'),
    );

    const workflowHeader = releaseWorkflow.slice(0, releaseWorkflow.indexOf('\njobs:'));
    expect(workflowHeader).toContain('actions: read');
    expect(workflowHeader).toContain('contents: read');
    expect(releaseWorkflow).not.toContain('release/*.exe');
    expect(releaseWorkflow).not.toContain('path: release/**');
    expect(releaseWorkflow).not.toContain('path: release/*');
    expect(publisher).toContain('--draft');
    expect(publisher).toContain('--prerelease');
    expect(publisher).toContain('--title "Lacuna ${GITHUB_REF_NAME#v} Beta"');
    expect(publisher).toContain('! -name SHA256SUMS-github.txt');
    expect(publisher).not.toContain('gh release delete-asset');
    expect(releaseWorkflow).not.toContain('--publish always');
    expect(releaseWorkflow.match(/actions\/attest@v4/g)).toHaveLength(3);
    expect(releaseWorkflow).not.toMatch(/actions\/attest@v[1-3](?:\D|$)/);
  });

  it('uses Node 24 action majors throughout CI and release workflows', () => {
    for (const workflow of [ciWorkflow, releaseWorkflow, securityWorkflow]) {
      expect(workflow).toContain('actions/checkout@v7');
      expect(workflow).not.toMatch(/actions\/checkout@v[1-6](?:\D|$)/);
      expect(workflow).not.toMatch(/actions\/(?:upload|download)-artifact@v[1-6](?:\D|$)/);
    }
    expect(releaseWorkflow).toContain('actions/upload-artifact@v7');
    expect(releaseWorkflow).toContain('actions/download-artifact@v8');
  });

  it('runs high-severity audits and least-privilege CodeQL on every supported change path', () => {
    expect(securityWorkflow).toContain('push:');
    expect(securityWorkflow).toContain('pull_request:');
    expect(securityWorkflow).toContain('schedule:');
    expect(securityWorkflow).toContain('branches: [master, main]');
    expect(securityWorkflow).toContain("cron: '31 3 * * 1'");
    expect(securityWorkflow).toMatch(/^permissions:\n {2}contents: read/m);

    expect(securityWorkflow.match(/bun install --frozen-lockfile/g)).toHaveLength(3);
    expect(securityWorkflow.match(/bun audit --audit-level=high/g)).toHaveLength(3);
    expect(securityWorkflow).toContain('working-directory: relay');
    expect(securityWorkflow).toContain('working-directory: tooling/handwriting-maths');
    expect(securityWorkflow).not.toContain('continue-on-error: true');
    expect(securityWorkflow).not.toContain('|| true');
    expect(securityWorkflow).not.toContain('bun audit --ignore');

    expect(securityWorkflow).toContain('language: [javascript-typescript, actions]');
    expect(securityWorkflow).toContain('github/codeql-action/init@v4');
    expect(securityWorkflow).toContain('github/codeql-action/analyze@v4');
    expect(securityWorkflow).toContain('build-mode: none');
    expect(securityWorkflow).toContain('security-events: write');
    expect(securityWorkflow).toContain('actions: read');
    expect(securityWorkflow).toContain('contents: read');
    expect(securityWorkflow).not.toContain('pull_request_target');
  });
});
