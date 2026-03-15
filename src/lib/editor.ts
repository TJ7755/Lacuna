import type { EditorOptions } from '@tiptap/core';
import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import StarterKit from '@tiptap/starter-kit';
import { DocumentEmbedNode } from '../components/notes/DocumentEmbedNode';
import katex from 'katex';
import { all, createLowlight } from 'lowlight';

const lowlight = createLowlight(all);

const INLINE_MATH_INPUT_RULE = /\$([^$\n]+)\$$/;

export const InlineMath = Node.create({
  name: 'inlineMath',

  inline: true,
  group: 'inline',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      formula: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-inline-math': 'true',
        class: 'inline-math',
        contenteditable: 'false',
      }),
    ];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INLINE_MATH_INPUT_RULE,
        type: this.type,
        getAttributes: (match) => ({ formula: match[1] ?? '' }),
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'inline-math';
      dom.setAttribute('data-inline-math', 'true');
      dom.setAttribute('contenteditable', 'false');

      const formula =
        typeof node.attrs.formula === 'string' ? node.attrs.formula : '';
      dom.dataset.formula = formula;
      dom.innerHTML = katex.renderToString(formula, {
        throwOnError: false,
        strict: false,
        output: 'html',
      });

      return { dom };
    };
  },
});

export function createEditorConfig(): Partial<EditorOptions> {
  return {
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      InlineMath,
      DocumentEmbedNode,
    ],
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  };
}
