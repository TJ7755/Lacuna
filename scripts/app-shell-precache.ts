import type { Plugin, Rolldown, ResolvedConfig } from 'vite';
import type { VitePluginPWAAPI } from 'vite-plugin-pwa';

type OutputChunk = Rolldown.OutputChunk;
type StaticChunk = Pick<OutputChunk, 'fileName' | 'imports' | 'isEntry'> & {
  viteMetadata?: { importedCss: Set<string> };
};

function collectStaticImports(chunks: readonly StaticChunk[], root: StaticChunk): string[] {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const eagerFiles = new Set<string>();
  const visit = (chunk: StaticChunk) => {
    if (eagerFiles.has(chunk.fileName)) return;
    eagerFiles.add(chunk.fileName);
    for (const imported of chunk.imports) {
      const dependency = byFileName.get(imported);
      if (dependency) visit(dependency);
    }
  };
  visit(root);
  return [...eagerFiles];
}

export function collectAppShellScripts(chunks: readonly StaticChunk[]): string[] {
  const entry = chunks.find((chunk) => chunk.isEntry && /^assets\/app-/.test(chunk.fileName));
  if (!entry) throw new Error('Could not find the application entry for shell precaching.');
  // Deferred shell controls must also work on their first use offline, as must the
  // welcome-course seed, which start-up loads whenever its flags are missing, and the
  // motion features every start-up loads straight after first paint.
  const deferredControls = chunks.filter((chunk) =>
    /^assets\/(?:RouteAnnouncement|SharingAnnouncement|CourseActions|seed|motionFeatures)-[A-Za-z0-9_-]{8}\.js$/.test(chunk.fileName),
  );
  return [
    ...new Set([
      ...collectStaticImports(chunks, entry),
      ...deferredControls.flatMap((control) => collectStaticImports(chunks, control)),
    ]),
  ];
}

/** CSS names change when a second HTML entry creates shared chunks. */
export function collectAppShellStyles(chunks: readonly StaticChunk[]): string[] {
  const scripts = new Set(collectAppShellScripts(chunks));
  return [
    ...new Set(
      chunks
        .filter((chunk) => scripts.has(chunk.fileName))
        .flatMap((chunk) => [...(chunk.viteMetadata?.importedCss ?? [])]),
    ),
  ];
}

/** Keep the Cards route's shared import spine available after an offline reload. */
export function collectOfflineCardsDependencies(chunks: readonly StaticChunk[]): string[] {
  const cards = chunks.find((chunk) =>
    /^assets\/CardsPage-[A-Za-z0-9_-]{8}\.js$/.test(chunk.fileName),
  );
  if (!cards) throw new Error('Could not find the Cards route for offline dependency precaching.');
  const eager = new Set(collectAppShellScripts(chunks));
  return collectStaticImports(chunks, cards).filter(
    (fileName) => fileName !== cards.fileName && !eager.has(fileName),
  );
}

/**
 * Receiving a course file must work on first use offline, and it now happens on Import,
 * which a learner may never have opened online. Precache that route, its static imports
 * and their stylesheets, leaving out what the shell already holds.
 */
export function collectOfflineImportRoute(chunks: readonly StaticChunk[]): string[] {
  const route = chunks.find((chunk) =>
    /^assets\/ImportPage-[A-Za-z0-9_-]{8}\.js$/.test(chunk.fileName),
  );
  if (!route) throw new Error('Could not find the Import route for offline precaching.');
  const eager = new Set([...collectAppShellScripts(chunks), ...collectAppShellStyles(chunks)]);
  const scripts = collectStaticImports(chunks, route);
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const styles = scripts.flatMap((fileName) => [
    ...(byFileName.get(fileName)?.viteMetadata?.importedCss ?? []),
  ]);
  return [...new Set([...scripts, ...styles])].filter((fileName) => !eager.has(fileName));
}

/** Precache the exact static entry graph, which Rolldown may split into many files. */
export function appShellPrecachePlugin(): Plugin {
  let pwa: VitePluginPWAAPI;

  return {
    name: 'lacuna-app-shell-precache',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      const plugin = config.plugins.find((candidate) => candidate.name === 'vite-plugin-pwa') as
        (Plugin & { api: VitePluginPWAAPI }) | undefined;
      if (!plugin)
        throw new Error('Could not find the PWA plugin for application shell precaching.');
      pwa = plugin.api;
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(
        (entry): entry is OutputChunk => entry.type === 'chunk',
      );
      const eagerFiles = [...collectAppShellScripts(chunks), ...collectAppShellStyles(chunks)];
      const cardsDependencies = collectOfflineCardsDependencies(chunks);
      const importRoute = collectOfflineImportRoute(chunks).filter(
        (fileName) => !cardsDependencies.includes(fileName),
      );

      pwa.extendManifestEntries((entries) => [
        ...entries,
        ...[...eagerFiles, ...cardsDependencies, ...importRoute].map((url) => ({
          url,
          revision: null,
        })),
      ]);
      const importBytes = importRoute.reduce((total, fileName) => {
        const output = bundle[fileName];
        return total + (output?.type === 'chunk' ? output.code.length : 0);
      }, 0);
      this.info(
        `Application shell precache: ${eagerFiles.length} shell scripts, ${cardsDependencies.length} shared Cards dependencies and ${importRoute.length} Import route files (${Math.round(importBytes / 1024)} KiB of script).`,
      );
    },
  };
}
