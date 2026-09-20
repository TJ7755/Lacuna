import type { Plugin, Rolldown, ResolvedConfig } from 'vite';
import type { VitePluginPWAAPI } from 'vite-plugin-pwa';

type OutputChunk = Rolldown.OutputChunk;
type StaticChunk = Pick<OutputChunk, 'fileName' | 'imports' | 'isEntry'>;

export function collectAppShellScripts(chunks: readonly StaticChunk[]): string[] {
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error('Could not find the application entry for shell precaching.');

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
  visit(entry);
  return [...eagerFiles];
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

      pwa.extendManifestEntries((entries) => [
        ...entries,
        ...eagerFiles.map((url) => ({ url, revision: null })),
      ]);
      this.info(`Application shell precache: ${eagerFiles.length} eager scripts.`);
    },
  };
}
