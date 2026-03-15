import { tiptapToPlainText } from '../tiptapUtils';
import { pdfjsLib } from '../pdfjs';

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: TipTapNode[];
};

function getTitleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '').trim();
  return withoutExtension || 'Imported document';
}

function paragraphNode(text: string): TipTapNode {
  const trimmed = text.trim();

  return {
    type: 'paragraph',
    content: trimmed ? [{ type: 'text', text: trimmed }] : [],
  };
}

function extractParagraphsFromPageTextItems(
  items: Array<{ str?: string; hasEOL?: boolean }>,
): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (const item of items) {
    const value = (item.str ?? '').trim();

    if (value) {
      currentLine = currentLine ? `${currentLine} ${value}` : value;
    }

    if (item.hasEOL) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  const paragraphs: string[] = [];
  let paragraphBuffer: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (paragraphBuffer.length > 0) {
        paragraphs.push(paragraphBuffer.join(' ').trim());
        paragraphBuffer = [];
      }
      continue;
    }

    paragraphBuffer.push(line);
  }

  if (paragraphBuffer.length > 0) {
    paragraphs.push(paragraphBuffer.join(' ').trim());
  }

  return paragraphs.filter(Boolean);
}

// Extract text content from a PDF file as a TipTap document.
export async function importPdf(file: File): Promise<{
  title: string;
  content: object;
  plainText: string;
  pageCount: number;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  });
  const pdf = await loadingTask.promise;

  const content: TipTapNode[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str?: string;
      hasEOL?: boolean;
    }>;

    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: `Page ${pageNumber}` }],
    });

    const paragraphs = extractParagraphsFromPageTextItems(items);

    if (paragraphs.length === 0) {
      content.push(paragraphNode(''));
      continue;
    }

    for (const paragraph of paragraphs) {
      content.push(paragraphNode(paragraph));
    }
  }

  const tipTapDoc = {
    type: 'doc',
    content,
  };

  return {
    title: getTitleFromFileName(file.name),
    content: tipTapDoc,
    plainText: tiptapToPlainText(tipTapDoc),
    pageCount: pdf.numPages,
  };
}
