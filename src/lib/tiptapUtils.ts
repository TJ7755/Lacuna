type TipTapNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
};

function safeChildren(node: TipTapNode): TipTapNode[] {
  return Array.isArray(node.content) ? node.content : [];
}

function extractInline(node: TipTapNode): string {
  if (typeof node.text === 'string') {
    return node.text;
  }

  if (node.type === 'inlineMath') {
    const formula = node.attrs?.formula;
    return typeof formula === 'string' ? formula : '';
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return safeChildren(node).map(extractInline).join('');
}

function extractBlock(node: TipTapNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'listItem':
      return extractInline(node);
    case 'codeBlock': {
      const code = safeChildren(node).map(extractInline).join('');
      return code.trimEnd();
    }
    case 'bulletList':
    case 'orderedList': {
      const items = safeChildren(node)
        .map(extractBlock)
        .map((line) => line.trim())
        .filter(Boolean);
      return items.join('\n');
    }
    default:
      return safeChildren(node).map(extractBlock).filter(Boolean).join('\n\n');
  }
}

// Converts a TipTap JSON document to plain text for use as LLM context
// Preserves paragraph breaks as newlines
// Strips all marks (bold, italic, etc.)
// Renders code blocks as-is with a blank line before/after
// Renders inline maths as the formula string (e.g. "E = mc^2")
export function tiptapToPlainText(doc: object): string {
  const root = doc as TipTapNode;
  const blocks = safeChildren(root);

  if (blocks.length === 0) {
    return '';
  }

  const chunks: string[] = [];

  for (const block of blocks) {
    if (block.type === 'codeBlock') {
      const code = extractBlock(block);
      if (code) {
        chunks.push(`\n${code}\n`);
      }
      continue;
    }

    const text = extractBlock(block).trim();
    if (text) {
      chunks.push(text);
    }
  }

  return chunks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
