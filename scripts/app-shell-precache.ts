import type { Plugin, Rolldown, ResolvedConfig } from 'vite';
import type { VitePluginPWAAPI } from 'vite-plugin-pwa';

type OutputChunk = Rolldown.OutputChunk;
type StaticChunk = Pick<OutputChunk, 'fileName' | 'imports' | 'isEntry'>;

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
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Could not find the application entry for shell precaching.');
  // This shell component loads before worker control, so runtime caching can miss it.
  const announcements = chunks.find((chunk) =>
    /^assets\/RouteAnnouncement-[A-Za-z0-9_-]{8}\.js$/.test(chunk.fileName),
  );
  return [
    ...new Set([
      ...collectStaticImports(chunks, entry),
      ...(announcements ? collectStaticImports(chunks, announcements) : []),
    ]),
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
      const eagerFiles = collectAppShellScripts(chunks);
      const cardsDependencies = collectOfflineCardsDependencies(chunks);

      pwa.extendManifestEntries((entries) => [
        ...entries,
        ...[...eagerFiles, ...cardsDependencies].map((url) => ({ url, revision: null })),
      ]);
      this.info(
        `Application shell precache: ${eagerFiles.length} shell scripts and ${cardsDependencies.length} shared Cards dependencies.`,
      );
    },
  };
}
