import { gzipSync } from 'node:zlib';
import type { OutputBundle, OutputChunk } from 'rollup';
import type { Plugin } from 'vite';

const SETTINGS_MODULE = '/src/pages/Settings.tsx';

const FORBIDDEN_STATIC_MODULES = [
  '/node_modules/react-qr-code/',
  '/node_modules/recharts/',
  '/src/db/backups.ts',
  '/src/db/export.ts',
  '/src/db/portability.ts',
  '/src/fsrs/optimise.ts',
  '/src/sync/manualMerge.ts',
  '/src/sync/pairing.ts',
] as const;

function isChunk(value: OutputBundle[string]): value is OutputChunk {
  return value.type === 'chunk';
}

function normaliseModuleId(id: string): string {
  return id.replaceAll('\\', '/');
}

export interface SettingsClosureReport {
  chunks: string[];
  rawBytes: number;
  gzipBytes: number;
  forbiddenModules: string[];
}

export function inspectSettingsStaticClosure(bundle: OutputBundle): SettingsClosureReport {
  const chunks = Object.values(bundle).filter(isChunk);
  const settingsChunk = chunks.find((chunk) =>
    Object.keys(chunk.modules).some((id) => normaliseModuleId(id).endsWith(SETTINGS_MODULE)),
  );
  if (!settingsChunk) throw new Error('Could not find the Settings chunk in the production build.');

  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const collectClosure = (root: OutputChunk) => {
    const closure = new Map<string, OutputChunk>();
    const visit = (chunk: OutputChunk) => {
      if (closure.has(chunk.fileName)) return;
      closure.set(chunk.fileName, chunk);
      for (const imported of chunk.imports) {
        const dependency = byFileName.get(imported);
        if (dependency) visit(dependency);
      }
    };
    visit(root);
    return closure;
  };
  const eagerEntry = chunks.find((chunk) => chunk.isEntry);
  if (!eagerEntry) throw new Error('Could not find the application entry in the production build.');
  const eagerFiles = new Set(collectClosure(eagerEntry).keys());
  if (eagerFiles.has(settingsChunk.fileName)) {
    throw new Error(
      'Settings is part of the eager application closure; expected a lazy Settings chunk.',
    );
  }
  const closure = collectClosure(settingsChunk);
  for (const eagerFile of eagerFiles) closure.delete(eagerFile);

  const modules = [...closure.values()].flatMap((chunk) => Object.keys(chunk.modules));
  const forbiddenModules = modules
    .map(normaliseModuleId)
    .filter((id) => FORBIDDEN_STATIC_MODULES.some((pattern) => id.includes(pattern)))
    .sort();
  const code = [...closure.values()].map((chunk) => chunk.code).join('\n');

  return {
    chunks: [...closure.keys()].sort(),
    rawBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
    forbiddenModules,
  };
}

export function settingsStaticClosurePlugin(): Plugin {
  return {
    name: 'lacuna-settings-static-closure',
    apply: 'build',
    generateBundle(_options, bundle) {
      const report = inspectSettingsStaticClosure(bundle);
      this.info(
        `Settings static closure: ${report.rawBytes} raw bytes, ${report.gzipBytes} gzip bytes across ${report.chunks.length} chunks.`,
      );
      if (report.forbiddenModules.length > 0) {
        this.error(
          `Settings statically imports action-only modules:\n${report.forbiddenModules.join('\n')}`,
        );
      }
    },
  };
}
