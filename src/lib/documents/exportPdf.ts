import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import type { Note } from '../../db/repositories/notes';
import { tiptapToPlainText } from '../tiptapUtils';

type TipTapNode = {
  type?: string;
  text?: string;
  content?: TipTapNode[];
};

type ExportBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'image'; src: string };

function safeFileName(name: string): string {
  const fallback = 'note';
  const trimmed = name.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || fallback;
}

function childNodes(node: TipTapNode): TipTapNode[] {
  return Array.isArray(node.content) ? node.content : [];
}

function inlineText(node: TipTapNode): string {
  if (typeof node.text === 'string') {
    return node.text;
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return childNodes(node).map(inlineText).join('');
}

function collectBlocks(doc: object): ExportBlock[] {
  const root = doc as TipTapNode;
  const blocks: ExportBlock[] = [];

  for (const node of childNodes(root)) {
    if (node.type === 'heading') {
      const text = inlineText(node).trim();
      if (text) {
        blocks.push({ kind: 'heading', text });
      }
      continue;
    }

    if (node.type === 'codeBlock') {
      const text = childNodes(node).map(inlineText).join('').trimEnd();
      if (text) {
        blocks.push({ kind: 'code', text });
      }
      continue;
    }

    if (node.type === 'image') {
      const src =
        typeof node.attrs?.src === 'string' ? (node.attrs.src as string) : '';
      if (src) {
        blocks.push({ kind: 'image', src });
      }
      continue;
    }

    const text = inlineText(node).trim();
    if (text) {
      blocks.push({ kind: 'paragraph', text });
    }
  }

  return blocks;
}

async function getImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      });
    };
    image.onerror = () =>
      reject(new Error('Could not load image for PDF export.'));
    image.src = src;
  });
}

// Export a Lacuna note as a PDF.
export async function exportNoteToPdf(note: Note): Promise<void> {
  const document = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margin = 20;
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  const ensurePageSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight <= pageHeight - margin) {
      return;
    }

    document.addPage();
    cursorY = margin;
  };

  document.setFont('helvetica', 'bold');
  document.setFontSize(20);

  const titleLines = document.splitTextToSize(
    note.title.trim() || 'Untitled note',
    contentWidth,
  );
  ensurePageSpace(titleLines.length * 8 + 4);
  document.text(titleLines, margin, cursorY);
  cursorY += titleLines.length * 8 + 4;

  const plainTextBody = tiptapToPlainText(note.content);
  const blocks = collectBlocks(note.content);

  if (blocks.length === 0 && plainTextBody) {
    blocks.push({ kind: 'paragraph', text: plainTextBody });
  }

  for (const block of blocks) {
    if (block.kind === 'heading') {
      document.setFont('helvetica', 'bold');
      document.setFontSize(14);

      const lines = document.splitTextToSize(block.text, contentWidth);
      ensurePageSpace(lines.length * 6 + 3);
      document.text(lines, margin, cursorY);
      cursorY += lines.length * 6 + 3;
      continue;
    }

    if (block.kind === 'code') {
      document.setFont('courier', 'normal');
      document.setFontSize(10);

      const lines = document.splitTextToSize(block.text, contentWidth - 4);
      const lineHeight = 5;
      const blockHeight = lines.length * lineHeight + 4;

      ensurePageSpace(blockHeight + 2);

      document.setDrawColor(220, 220, 220);
      document.setFillColor(245, 245, 245);
      document.roundedRect(
        margin,
        cursorY - 3,
        contentWidth,
        blockHeight,
        1.5,
        1.5,
        'FD',
      );
      document.text(lines, margin + 2, cursorY + 1);
      cursorY += blockHeight + 2;
      continue;
    }

    if (block.kind === 'image') {
      try {
        const { width, height } = await getImageDimensions(block.src);
        const scaledWidth = contentWidth;
        const scaledHeight = Math.max((height / width) * scaledWidth, 10);
        const format = block.src.startsWith('data:image/jpeg')
          ? 'JPEG'
          : block.src.startsWith('data:image/webp')
            ? 'WEBP'
            : 'PNG';
        ensurePageSpace(scaledHeight + 4);

        document.addImage(
          block.src,
          format,
          margin,
          cursorY,
          scaledWidth,
          scaledHeight,
        );
        cursorY += scaledHeight + 4;
      } catch {
        document.setFont('helvetica', 'italic');
        document.setFontSize(10);
        ensurePageSpace(8);
        document.text('[Image omitted: could not render]', margin, cursorY);
        cursorY += 8;
      }

      continue;
    }

    document.setFont('helvetica', 'normal');
    document.setFontSize(11);

    const lines = document.splitTextToSize(block.text, contentWidth);
    const lineHeight = 5.5;
    ensurePageSpace(lines.length * lineHeight + 2);
    document.text(lines, margin, cursorY);
    cursorY += lines.length * lineHeight + 2;
  }

  const totalPages = document.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(9);
    document.text(`${page}/${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    });
  }

  document.save(`${safeFileName(note.title)}.pdf`);
}
