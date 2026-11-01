import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

// Domain owners must not depend on UI composition, including through type imports.
export const domainDirectories = [
  'ai',
  'course',
  'db',
  'fsrs',
  'insights',
  'items',
  'jev',
  'mcp',
  'media',
  'onboarding',
  'questions',
  'shareLinks',
  'specifications',
  'state',
  'sync',
];

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const declarationExtension = /\.d\.[cm]?ts$/;
export const sourcePath = (root, file) => relative(root, file).split(sep).join('/');

export function createResolver(root, { runtime = false } = {}) {
  const configFile = join(root, 'tsconfig.app.json');
  const config = existsSync(configFile)
    ? ts.readConfigFile(configFile, ts.sys.readFile).config
    : {};
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
  // Value edges must reach implementations, not companion declarations that
  // TypeScript prefers for type checking. Boundary checks still include types.
  const host = runtime
    ? {
        ...ts.sys,
        fileExists: (file) => !declarationExtension.test(file) && ts.sys.fileExists(file),
      }
    : ts.sys;
  const cache = ts.createModuleResolutionCache(root, (file) => file, compilerOptions);
  return (specifier, importer) => {
    const resolved = ts.resolveModuleName(
      specifier.split(/[?#]/, 1)[0],
      importer,
      compilerOptions,
      host,
      cache,
    ).resolvedModule;
    if (!resolved) return;
    let file = resolve(resolved.resolvedFileName);
    if (file.startsWith(join(root, 'packages') + sep) && sourceExtension.test(file)) return file;
    const local = sourcePath(join(root, 'apps/web/src'), file);
    if (!local.startsWith('../') && !local.startsWith('/') && sourceExtension.test(file))
      return file;
  };
}

export const domainUiRule = {
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
              properties: {
                from: { type: 'string', pattern: '\\.test\\.tsx?$' },
                to: { type: 'string' },
              },
              required: ['from', 'to'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbidden:
        'Domain code must not import UI module {{target}}; move shared contracts into a domain-owned module.',
    },
  },
  create(context) {
    const root = context.cwd;
    const importer = context.filename;
    const importerPath = sourcePath(root, importer);
    if (
      !importerPath.startsWith('packages/') &&
      !domainDirectories.some((directory) => importerPath.startsWith(`apps/web/src/${directory}/`))
    )
      return {};
    const resolveImport = createResolver(root);
    const check = (node, source) => {
      const specifier =
        source?.type === 'TemplateLiteral' && source.expressions.length === 0
          ? source.quasis[0].value.cooked
          : source?.value;
      if (typeof specifier !== 'string') return;
      const target = resolveImport(specifier, importer);
      if (
        target &&
        (/^apps\/web\/src\/(?:pages|components|teacher)\//.test(sourcePath(root, target)) ||
          (importerPath.startsWith('packages/') &&
            !sourcePath(root, target).startsWith('packages/')))
      ) {
        const permitted = context.options[0]?.integrationTests ?? [];
        if (
          !permitted.some(
            ({ from, to }) =>
              from === sourcePath(root, importer) && to === sourcePath(root, target),
          )
        ) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { target: sourcePath(root, target) },
          });
        }
      }
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

function valueSpecifiers(clause) {
  return clause.elements.length === 0 || clause.elements.some((element) => !element.isTypeOnly);
}

export function importGraph(root) {
  const resolveImport = createResolver(root, { runtime: true });
  const graph = new Map();
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (sourceExtension.test(file) && !declarationExtension.test(file)) {
        const source = ts.createSourceFile(
          file,
          readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        const imports = new Set();
        const add = (literal) => {
          if (!literal || !ts.isStringLiteralLike(literal)) return;
          const target = resolveImport(literal.text, file);
          if (target) imports.add(target);
        };
        const visit = (node) => {
          if (ts.isImportDeclaration(node)) {
            const clause = node.importClause;
            if (
              !clause ||
              (!clause.isTypeOnly &&
                (clause.name ||
                  !clause.namedBindings ||
                  ts.isNamespaceImport(clause.namedBindings) ||
                  valueSpecifiers(clause.namedBindings)))
            )
              add(node.moduleSpecifier);
          } else if (ts.isExportDeclaration(node)) {
            if (
              !node.isTypeOnly &&
              (!node.exportClause ||
                !ts.isNamedExports(node.exportClause) ||
                valueSpecifiers(node.exportClause))
            )
              add(node.moduleSpecifier);
          } else if (ts.isImportEqualsDeclaration(node)) {
            if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference))
              add(node.moduleReference.expression);
          } else if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
          ) {
            add(node.arguments[0]);
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
        graph.set(file, imports);
      }
    }
  };
  walk(join(root, 'apps/web/src'));
  if (existsSync(join(root, 'packages'))) walk(join(root, 'packages'));
  return graph;
}

// Tarjan's strongly connected components: every internal edge in a cyclic
// component lies on a cycle. Track the exact edge set, not a folder-wide waiver.
export function cyclicEdges(graph, root) {
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];
  const visit = (file) => {
    indices.set(file, indices.size);
    low.set(file, indices.get(file));
    stack.push(file);
    active.add(file);
    for (const target of graph.get(file) ?? []) {
      if (!graph.has(target)) continue;
      if (!indices.has(target)) {
        visit(target);
        low.set(file, Math.min(low.get(file), low.get(target)));
      } else if (active.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)));
    }
    if (low.get(file) !== indices.get(file)) return;
    const members = new Set();
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      members.add(member);
    } while (member !== file);
    const edges = [...members]
      .flatMap((from) =>
        [...graph.get(from)]
          .filter((to) => members.has(to))
          .map((to) => `${sourcePath(root, from)} -> ${sourcePath(root, to)}`),
      )
      .sort();
    if (edges.length) cycles.push(edges);
  };
  for (const file of graph.keys()) if (!indices.has(file)) visit(file);
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

export function checkCycles(root, exceptions) {
  const cycles = cyclicEdges(importGraph(root), root);
  const signature = (edges) => JSON.stringify([...edges].sort());
  const actual = new Set(cycles.map(signature));
  const allowed = new Set(exceptions.map((exception) => signature(exception.edges)));
  const errors = cycles
    .filter((edges) => !allowed.has(signature(edges)))
    .map((edges) => `Untracked import cycle:\n  ${edges.join('\n  ')}`);
  for (const exception of exceptions) {
    if (!exception.issue || !exception.reason || !actual.has(signature(exception.edges))) {
      errors.push(`Stale or undocumented import-cycle exception: ${JSON.stringify(exception)}`);
    }
  }
  return { cycles, errors };
}
