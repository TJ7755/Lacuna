import { resolve, relative, sep } from 'node:path';
import ts from 'typescript';

// Deliberately limited to relay internals. Electron MCP/API imports from src are a later slice.
export const relayImportsRule = {
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
      forbidden: 'Use relay/shared/insights/index instead of relay internals ({{target}}).',
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
      const forbidden =
        target.startsWith('relay/src/') ||
        (target.startsWith('relay/shared/') && target !== 'relay/shared/insights/index.ts');
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
