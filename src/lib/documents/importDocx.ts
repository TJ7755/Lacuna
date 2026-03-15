import mammoth from 'mammoth';
import { tiptapToPlainText } from '../tiptapUtils';

type TipTapMark = {
  type: 'bold' | 'italic' | 'strike';
};

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  text?: string;
  content?: TipTapNode[];
};

function getTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || 'Imported document';
}

function cloneMarks(marks: TipTapMark[]): TipTapMark[] | undefined {
  return marks.length === 0 ? undefined : marks.map((mark) => ({ ...mark }));
}

function textNode(text: string, marks: TipTapMark[]): TipTapNode {
  const node: TipTapNode = {
    type: 'text',
    text,
  };

  const nodeMarks = cloneMarks(marks);
  if (nodeMarks) {
    node.marks = nodeMarks;
  }

  return node;
}

function extractInlineFromElement(
  element: Node,
  marks: TipTapMark[] = [],
): TipTapNode[] {
  if (element.nodeType === Node.TEXT_NODE) {
    const text = element.textContent ?? '';
    if (!text) {
      return [];
    }

    return [textNode(text, marks)];
  }

  if (element.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const el = element as HTMLElement;
  const nextMarks = [...marks];

  if (el.tagName === 'STRONG' || el.tagName === 'B') {
    nextMarks.push({ type: 'bold' });
  }

  if (el.tagName === 'EM' || el.tagName === 'I') {
    nextMarks.push({ type: 'italic' });
  }

  if (el.tagName === 'S' || el.tagName === 'STRIKE') {
    nextMarks.push({ type: 'strike' });
  }

  if (el.tagName === 'BR') {
    return [{ type: 'hardBreak' }];
  }

  const content = Array.from(el.childNodes).flatMap((node) =>
    extractInlineFromElement(node, nextMarks),
  );

  if (content.length > 0) {
    return content;
  }

  const text = el.textContent ?? '';
  return text ? [textNode(text, nextMarks)] : [];
}

function paragraphNodeFromText(text: string): TipTapNode {
  const trimmed = text.trim();
  return {
    type: 'paragraph',
    content: trimmed ? [{ type: 'text', text: trimmed }] : [],
  };
}

function parseList(
  el: HTMLElement,
  type: 'bulletList' | 'orderedList',
): TipTapNode {
  const items = Array.from(el.children)
    .filter((child) => child.tagName === 'LI')
    .map((child) => {
      const itemElement = child as HTMLElement;
      const paragraphs: TipTapNode[] = [];
      const nestedLists: TipTapNode[] = [];

      for (const childNode of Array.from(itemElement.childNodes)) {
        if (childNode.nodeType === Node.ELEMENT_NODE) {
          const childEl = childNode as HTMLElement;

          if (childEl.tagName === 'UL') {
            nestedLists.push(parseList(childEl, 'bulletList'));
            continue;
          }

          if (childEl.tagName === 'OL') {
            nestedLists.push(parseList(childEl, 'orderedList'));
            continue;
          }

          const inlineContent = extractInlineFromElement(childEl);
          if (inlineContent.length > 0) {
            paragraphs.push({ type: 'paragraph', content: inlineContent });
          }

          continue;
        }

        if (childNode.nodeType === Node.TEXT_NODE) {
          const text = childNode.textContent?.trim() ?? '';
          if (text) {
            paragraphs.push({
              type: 'paragraph',
              content: [{ type: 'text', text }],
            });
          }
        }
      }

      const content =
        paragraphs.length > 0
          ? [...paragraphs, ...nestedLists]
          : [{ type: 'paragraph' }, ...nestedLists];
      return {
        type: 'listItem',
        content,
      };
    });

  return {
    type,
    content: items,
  };
}

function parseBlock(element: Element): TipTapNode[] {
  const el = element as HTMLElement;

  if (el.tagName === 'P') {
    return [{ type: 'paragraph', content: extractInlineFromElement(el) }];
  }

  if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3') {
    const level = Number(el.tagName.slice(1));
    return [
      {
        type: 'heading',
        attrs: { level },
        content: extractInlineFromElement(el),
      },
    ];
  }

  if (el.tagName === 'BLOCKQUOTE') {
    return [
      {
        type: 'blockquote',
        content: [{ type: 'paragraph', content: extractInlineFromElement(el) }],
      },
    ];
  }

  if (el.tagName === 'PRE') {
    const codeElement = el.querySelector('code');
    const codeText = (codeElement?.textContent ?? el.textContent ?? '').replace(
      /\n+$/,
      '',
    );

    return [
      {
        type: 'codeBlock',
        content: codeText ? [{ type: 'text', text: codeText }] : [],
      },
    ];
  }

  if (el.tagName === 'UL') {
    return [parseList(el, 'bulletList')];
  }

  if (el.tagName === 'OL') {
    return [parseList(el, 'orderedList')];
  }

  const fallback = (el.textContent ?? '').trim();
  return fallback ? [paragraphNodeFromText(fallback)] : [];
}

// Convert HTML from mammoth into a TipTap JSON document.
export function htmlToTipTap(html: string): object {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, 'text/html');
  const content: TipTapNode[] = [];

  for (const node of Array.from(parsed.body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() ?? '';
      if (text) {
        content.push(paragraphNodeFromText(text));
      }
      continue;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      content.push(...parseBlock(node as Element));
    }
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

// Convert a .docx file to a TipTap-compatible JSON document.
export async function importDocx(file: File): Promise<{
  title: string;
  content: object;
  plainText: string;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const content = htmlToTipTap(result.value);

  return {
    title: getTitleFromFileName(file.name),
    content,
    plainText: tiptapToPlainText(content),
  };
}
