import { resolve, relative, sep } from 'node:path';
import ts from 'typescript';

function importsRule(message, forbiddenTarget) {
  return {
    meta: {
      type: 'problem',
      schema: [
        {
          type: 'object',
          properties: {
            integrationTests: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: { type: 'string' }, to: { type: 'string' } },
                required: ['from', 'to'],
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        forbidden: message,
      },
    },
    create(context) {
      const root = context.cwd;
      const local = (file) => relative(root, file).split(sep).join('/');
      const importer = local(context.filename);
      const config =
        ts.readConfigFile(resolve(root, 'tsconfig.app.json'), ts.sys.readFile).config ?? {};
      const { options } = ts.parseJsonConfigFileContent(
        config,
        { ...ts.sys, readDirectory: () => [] },
        root,
      );
      const compilerOptions = {
        ...options,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowJs: true,
      };
      const cache = ts.createModuleResolutionCache(root, (file) => file, compilerOptions);
      const check = (node, source) => {
        const specifier =
          source?.type === 'TemplateLiteral' && source.expressions.length === 0
            ? source.quasis[0].value.cooked
            : source?.value;
        if (typeof specifier !== 'string') return;
        const resolved = ts.resolveModuleName(
          specifier.split(/[?#]/, 1)[0],
          context.filename,
          compilerOptions,
          ts.sys,
          cache,
        ).resolvedModule;
        if (!resolved || resolved.isExternalLibraryImport) return;
        const target = local(resolved.resolvedFileName);
        const forbidden = forbiddenTarget(importer, target);
        const permitted = context.options[0]?.integrationTests ?? [];
        if (forbidden && !permitted.some(({ from, to }) => from === importer && to === target))
          context.report({ node, messageId: 'forbidden', data: { target } });
      };
      return {
        ImportDeclaration: (node) => check(node, node.source),
        ExportNamedDeclaration: (node) => check(node, node.source),
        ExportAllDeclaration: (node) => check(node, node.source),
        ImportExpression: (node) => check(node, node.source),
        TSImportType: (node) => check(node, node.source),
        TSExternalModuleReference: (node) => check(node, node.expression),
        CallExpression: (node) => {
          if (node.callee.type === 'Identifier' && node.callee.name === 'require')
            check(node, node.arguments[0]);
        },
      };
    },
  };
}

export const relayImportsRule = importsRule(
  'Use apps/relay/shared/insights/index instead of relay internals ({{target}}).',
  (_importer, target) =>
    target.startsWith('apps/relay/src/') ||
    (target.startsWith('packages/protocol/src/insights/') &&
      target !== 'packages/protocol/src/insights/index.ts') ||
    (target.startsWith('apps/relay/shared/') && target !== 'apps/relay/shared/insights/index.ts'),
);

export const appImportsRule = importsRule(
  'Use a declared app entry point instead of app internals ({{target}}).',
  (importer, target) => {
    if (!target.startsWith('apps/web/src/')) return false;
    if (importer.startsWith('apps/ai/api/')) return target !== 'apps/web/src/jev/apiEntry.ts';
    if (!importer.startsWith('apps/desktop/mcp/')) return false;
    return ![
      'apps/web/src/mcp/contractEntry.ts',
      'apps/web/src/mcp/bridgeEntry.ts',
      'apps/web/src/mcp/companionEntry.ts',
      'apps/web/src/ai/protocol.ts',
      'apps/web/src/ai/companionErrors.ts',
    ].includes(target);
  },
);

export const trainingImportsRule = importsRule(
  'Use the runtime-owned coefficient asset instead of training internals ({{target}}).',
  (importer, target) =>
    ['apps/web/src/', 'apps/ai/server/', 'apps/desktop/', 'apps/ai/api/'].some((area) =>
      importer.startsWith(area),
    ) && target.startsWith('tooling/short-term-memory/'),
);
