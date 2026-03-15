import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DocumentEmbedNodeView } from './DocumentEmbed';

export const DocumentEmbedNode = Node.create({
  name: 'documentEmbed',

  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      fileName: {
        default: '',
      },
      fileType: {
        default: 'pdf',
      },
      dataUrl: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-document-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-document-embed': 'true' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentEmbedNodeView);
  },
});
