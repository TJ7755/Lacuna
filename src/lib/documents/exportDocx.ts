import {
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx';
import type { Note } from '../../db/repositories/notes';

type TipTapMark = {
  type?: string;
};

type TipTapNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  text?: string;
  content?: TipTapNode[];
};

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

function createTextRuns(
  node: TipTapNode,
  inheritedMarks: TipTapMark[] = [],
): TextRun[] {
  const activeMarks = [
    ...inheritedMarks,
    ...(Array.isArray(node.marks) ? node.marks : []),
  ];

  if (typeof node.text === 'string') {
    return [
      new TextRun({
        text: node.text,
        bold: activeMarks.some((mark) => mark.type === 'bold'),
        italics: activeMarks.some((mark) => mark.type === 'italic'),
        strike: activeMarks.some((mark) => mark.type === 'strike'),
      }),
    ];
  }

  if (node.type === 'hardBreak') {
    return [new TextRun({ break: 1 })];
  }

  return childNodes(node).flatMap((child) =>
    createTextRuns(child, activeMarks),
  );
}

function extractPlainText(node: TipTapNode): string {
  if (typeof node.text === 'string') {
    return node.text;
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return childNodes(node).map(extractPlainText).join('');
}

function headingLevel(level: number) {
  if (level === 1) {
    return HeadingLevel.HEADING_1;
  }

  if (level === 2) {
    return HeadingLevel.HEADING_2;
  }

  return HeadingLevel.HEADING_3;
}

function listParagraphs(
  listNode: TipTapNode,
  ordered: boolean,
  level = 0,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (const item of childNodes(listNode)) {
    if (item.type !== 'listItem') {
      continue;
    }

    const itemChildren = childNodes(item);

    for (const child of itemChildren) {
      if (child.type === 'paragraph') {
        paragraphs.push(
          new Paragraph({
            children: createTextRuns(child),
            ...(ordered
              ? { numbering: { reference: 'lacuna-numbered', level } }
              : { bullet: { level } }),
          }),
        );
        continue;
      }

      if (child.type === 'bulletList') {
        paragraphs.push(...listParagraphs(child, false, level + 1));
        continue;
      }

      if (child.type === 'orderedList') {
        paragraphs.push(...listParagraphs(child, true, level + 1));
      }
    }
  }

  return paragraphs;
}

function mapNodeToParagraphs(node: TipTapNode): Paragraph[] {
  if (node.type === 'paragraph') {
    return [new Paragraph({ children: createTextRuns(node) })];
  }

  if (node.type === 'heading') {
    const rawLevel = Number(node.attrs?.level);
    const level = Number.isFinite(rawLevel)
      ? Math.max(1, Math.min(3, rawLevel))
      : 1;

    return [
      new Paragraph({
        heading: headingLevel(level),
        children: createTextRuns(node),
      }),
    ];
  }

  if (node.type === 'blockquote') {
    return [
      new Paragraph({
        children: createTextRuns(node),
        indent: { left: 480 },
        border: {
          left: {
            style: BorderStyle.SINGLE,
            color: 'A0A0A0',
            size: 6,
            space: 8,
          },
        },
      }),
    ];
  }

  if (node.type === 'codeBlock') {
    const text = extractPlainText(node) || ' ';

    return [
      new Paragraph({
        children: [
          new TextRun({
            text,
            font: 'Courier New',
            size: 20,
          }),
        ],
        shading: {
          type: ShadingType.CLEAR,
          fill: 'F4F4F4',
        },
      }),
    ];
  }

  if (node.type === 'bulletList') {
    return listParagraphs(node, false, 0);
  }

  if (node.type === 'orderedList') {
    return listParagraphs(node, true, 0);
  }

  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    const src = node.attrs.src;
    const base64 = src.includes(',') ? src.split(',')[1] : '';

    if (!base64) {
      return [];
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return [
      new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            transformation: {
              width: 520,
              height: 320,
            },
          }),
        ],
      }),
    ];
  }

  const fallbackText = extractPlainText(node).trim();
  if (fallbackText) {
    return [new Paragraph({ children: [new TextRun(fallbackText)] })];
  }

  return [];
}

async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Export a Lacuna note as a .docx file.
export async function exportNoteToDocx(note: Note): Promise<void> {
  const root = note.content as TipTapNode;
  const contentNodes = childNodes(root);

  const bodyParagraphs = contentNodes.flatMap((node) =>
    mapNodeToParagraphs(node),
  );

  if (bodyParagraphs.length === 0) {
    bodyParagraphs.push(new Paragraph(''));
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'lacuna-numbered',
          levels: Array.from({ length: 6 }, (_, level) => ({
            level,
            format: 'decimal',
            text: `%${level + 1}.`,
            alignment: 'left',
          })),
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({
            text: note.title.trim() || 'Untitled note',
            heading: HeadingLevel.TITLE,
          }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  await downloadBlob(blob, `${safeFileName(note.title)}.docx`);
}
