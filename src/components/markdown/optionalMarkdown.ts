import { useEffect, useState } from 'react';
import type { Plugin } from 'unified';
import type { Root } from 'hast';
type MarkdownPlugin = Plugin<[], Root>;

export interface OptionalMarkdownPlugins {
  math?: MarkdownPlugin;
  highlight?: MarkdownPlugin;
}

let math: Promise<MarkdownPlugin> | undefined;
let highlight: Promise<MarkdownPlugin> | undefined;

/** Keep maths readable and answer comparison synchronous before KaTeX is available. */
export const answerMathPlugin: MarkdownPlugin = () => (tree) => {
  interface Node {
    type: string;
    tagName?: string;
    properties?: { className?: string[]; [key: string]: unknown };
    children?: Node[];
    value?: string;
  }
  const visit = (node: Node) => {
    if (node.tagName === 'code' && node.properties?.className?.includes('language-math')) {
      node.tagName = 'span';
      node.properties = { className: ['katex'] };
      node.children = [
        {
          type: 'element',
          tagName: 'annotation',
          properties: { encoding: 'application/x-tex' },
          children: node.children,
        },
      ];
      return;
    }
    node.children?.forEach(visit);
  };
  visit(tree as Node);
};

export function useOptionalMarkdown(source: string): OptionalMarkdownPlugins {
  const [plugins, setPlugins] = useState<OptionalMarkdownPlugins>({});
  // Conservative detection avoids parsing twice. False positives only fetch an optional renderer.
  const needsMath = source.includes('$') || /(?:`{3,}|~{3,})math\b|language-math\b/.test(source);
  const codeSource = source.replace(
    /(^|\n)(`{3,}|~{3,})(?:mermaid|math)[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g,
    '',
  );
  const needsHighlight = /```|~~~|<pre\b|^(?: {4}|\t)\S/m.test(codeSource);
  useEffect(() => {
    let cancelled = false;
    if (needsMath && !plugins.math) {
      math ??= import('./optionalMarkdownMath').then((module) => module.default);
      void math
        .then((plugin) => {
          if (!cancelled) setPlugins((previous) => ({ ...previous, math: plugin }));
        })
        .catch(() => {
          math = undefined;
        });
    }
    if (needsHighlight && !plugins.highlight) {
      highlight ??= import('rehype-highlight').then(
        (module) => module.default as unknown as MarkdownPlugin,
      );
      void highlight
        .then((plugin) => {
          if (!cancelled) setPlugins((previous) => ({ ...previous, highlight: plugin }));
        })
        .catch(() => {
          highlight = undefined;
        });
    }
    return () => {
      cancelled = true;
    };
  }, [needsMath, needsHighlight, plugins]);
  return plugins;
}
